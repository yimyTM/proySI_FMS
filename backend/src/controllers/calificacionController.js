const pool = require('../config/db');
const { registrarBitacora, getClientIp } = require('../utils/bitacora');

const ROLES_PROFESOR = [3, 12];
const ROLES_GESTION = [1, 2];

const isProfesor = (role) => ROLES_PROFESOR.includes(role);
const isGestion = (role) => ROLES_GESTION.includes(role);

const profesorCondition = `
    (
        cm.id_profesor = (SELECT id_profesor FROM profesor WHERE id_usuario = $1)
        OR c.id_profesor = (SELECT id_profesor FROM profesor WHERE id_usuario = $1)
    )
`;

const ensureSchema = async (client = pool) => {
    await client.query(`
        ALTER TABLE actividad_evaluacion
        ADD COLUMN IF NOT EXISTS valor_maximo NUMERIC(5,2)
    `);

    await client.query(`
        CREATE TABLE IF NOT EXISTS materia_trimestre (
            id_materia_trimestre SERIAL PRIMARY KEY,
            id_curso_materia INTEGER NOT NULL REFERENCES curso_materia(id_curso_materia),
            trimestre INTEGER NOT NULL CHECK (trimestre BETWEEN 1 AND 3),
            estado VARCHAR(20) NOT NULL DEFAULT 'abierto'
                CHECK (estado IN ('abierto', 'cerrado', 'libreta_aprobada')),
            fecha_actualizacion TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
            UNIQUE (id_curso_materia, trimestre)
        )
    `);
};

const getActividad = async (client, idActividad) => {
    const result = await client.query(`
        SELECT
            ae.id_actividad,
            ae.id_curso_materia,
            ae.id_dimension_eval,
            ae.trimestre,
            ae.nombre_actividad,
            ae.fecha_actividad,
            COALESCE(ae.valor_maximo, de.puntaje_maximo) AS valor_maximo,
            de.nombre_dimension,
            de.puntaje_maximo,
            cm.id_curso,
            cm.id_materia,
            c.id_gestion,
            n.nombre_nivel,
            g.nombre_grado,
            c.paralelo,
            c.turno,
            m.nombre_materia
        FROM actividad_evaluacion ae
        JOIN dimension_evaluacion de ON de.id_dimension_eval = ae.id_dimension_eval
        JOIN curso_materia cm ON cm.id_curso_materia = ae.id_curso_materia
        JOIN curso c ON c.id_curso = cm.id_curso
        JOIN grado g ON g.id_grado = c.id_grado
        JOIN nivel n ON n.id_nivel = g.id_nivel
        JOIN materia m ON m.id_materia = cm.id_materia
        WHERE ae.id_actividad = $1
          AND c.estado = TRUE
    `, [idActividad]);

    return result.rows[0] || null;
};

const validarAccesoActividad = async (client, req, idActividad) => {
    if (isGestion(req.usuario.role)) return true;
    if (!isProfesor(req.usuario.role)) return false;

    const result = await client.query(`
        SELECT 1
        FROM actividad_evaluacion ae
        JOIN curso_materia cm ON cm.id_curso_materia = ae.id_curso_materia
        JOIN curso c ON c.id_curso = cm.id_curso
        WHERE ae.id_actividad = $2
          AND ${profesorCondition}
        LIMIT 1
    `, [req.usuario.id, idActividad]);

    return result.rows.length > 0;
};

const validarTrimestreAbierto = async (client, actividad) => {
    const estado = await client.query(`
        INSERT INTO materia_trimestre (id_curso_materia, trimestre, estado)
        VALUES ($1, $2, 'abierto')
        ON CONFLICT (id_curso_materia, trimestre)
        DO UPDATE SET estado = materia_trimestre.estado
        RETURNING estado
    `, [actividad.id_curso_materia, actividad.trimestre]);

    if (estado.rows[0].estado !== 'abierto') {
        return { abierto: false, motivo: 'El trimestre está cerrado o la libreta fue aprobada' };
    }

    const libreta = await client.query(`
        SELECT 1
        FROM libreta_emitida
        WHERE id_curso = $1
          AND id_gestion = $2
          AND trimestre = $3
          AND estado IN ('aprobada', 'entregada')
        LIMIT 1
    `, [actividad.id_curso, actividad.id_gestion, actividad.trimestre]);

    if (libreta.rows.length > 0) {
        await client.query(`
            UPDATE materia_trimestre
            SET estado = 'libreta_aprobada',
                fecha_actualizacion = NOW()
            WHERE id_curso_materia = $1
              AND trimestre = $2
        `, [actividad.id_curso_materia, actividad.trimestre]);

        return { abierto: false, motivo: 'El trimestre está cerrado o la libreta fue aprobada' };
    }

    return { abierto: true, motivo: null };
};

const getPromediosEstudiante = async (client, idEstudiante, actividad) => {
    const dimensiones = await client.query(`
        SELECT
            de.id_dimension_eval,
            de.nombre_dimension,
            de.puntaje_maximo,
            ROUND(AVG(cal.nota)::numeric, 2) AS promedio
        FROM dimension_evaluacion de
        JOIN actividad_evaluacion ae ON ae.id_dimension_eval = de.id_dimension_eval
        JOIN calificacion cal ON cal.id_actividad = ae.id_actividad
        WHERE ae.id_curso_materia = $1
          AND ae.trimestre = $2
          AND cal.id_estudiante = $3
        GROUP BY de.id_dimension_eval, de.nombre_dimension, de.puntaje_maximo
        ORDER BY de.id_dimension_eval
    `, [actividad.id_curso_materia, actividad.trimestre, idEstudiante]);

    const promedioMateria = dimensiones.rows.reduce(
        (total, row) => total + Number(row.promedio || 0),
        0
    );

    const general = await client.query(`
        WITH promedios_materia AS (
            SELECT
                ae.id_curso_materia,
                de.id_dimension_eval,
                AVG(cal.nota) AS promedio_dimension
            FROM calificacion cal
            JOIN actividad_evaluacion ae ON ae.id_actividad = cal.id_actividad
            JOIN dimension_evaluacion de ON de.id_dimension_eval = ae.id_dimension_eval
            JOIN curso_materia cm ON cm.id_curso_materia = ae.id_curso_materia
            JOIN curso c ON c.id_curso = cm.id_curso
            WHERE cal.id_estudiante = $1
              AND c.id_gestion = $2
              AND ae.trimestre = $3
            GROUP BY ae.id_curso_materia, de.id_dimension_eval
        ),
        totales_materia AS (
            SELECT id_curso_materia, SUM(promedio_dimension) AS nota_materia
            FROM promedios_materia
            GROUP BY id_curso_materia
        )
        SELECT ROUND(AVG(nota_materia)::numeric, 2) AS promedio_general
        FROM totales_materia
    `, [idEstudiante, actividad.id_gestion, actividad.trimestre]);

    return {
        dimensiones: dimensiones.rows,
        promedio_materia: Number(promedioMateria.toFixed(2)),
        promedio_general: Number(general.rows[0]?.promedio_general || promedioMateria).toFixed(2),
    };
};

const listarCalificacionesActividad = async (req, res) => {
    const idActividad = Number(req.params.id_actividad);

    if (!idActividad) {
        return res.status(400).json({ message: 'Debe enviar una actividad válida' });
    }

    try {
        await ensureSchema();

        if (!(await validarAccesoActividad(pool, req, idActividad))) {
            return res.status(403).json({ message: 'No tiene permisos para consultar esta actividad' });
        }

        const actividad = await getActividad(pool, idActividad);
        if (!actividad) {
            return res.status(404).json({ message: 'Actividad no encontrada' });
        }

        const estadoTrimestre = await validarTrimestreAbierto(pool, actividad);

        const estudiantes = await pool.query(`
            SELECT
                e.id_estudiante,
                e.nombre,
                e.apellido,
                e.ci,
                e.estado,
                cal.id_calificacion,
                cal.nota,
                cal.fecha_evaluacion,
                cal.observaciones,
                (e.estado = 'retirado') AS bloqueado
            FROM inscripcion i
            JOIN estudiante e ON e.id_estudiante = i.id_estudiante
            LEFT JOIN calificacion cal
                ON cal.id_estudiante = e.id_estudiante
               AND cal.id_actividad = $2
            WHERE i.id_curso = $1
              AND i.estado = 'inscrito'
              AND e.estado IN ('activo', 'retirado')
            ORDER BY e.apellido, e.nombre
        `, [actividad.id_curso, idActividad]);

        res.json({
            actividad,
            trimestre_abierto: estadoTrimestre.abierto,
            motivo_bloqueo: estadoTrimestre.motivo,
            estudiantes: estudiantes.rows,
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al cargar calificaciones', error: error.message });
    }
};

const guardarCalificacionesActividad = async (req, res) => {
    const idActividad = Number(req.params.id_actividad);
    const calificaciones = Array.isArray(req.body.calificaciones) ? req.body.calificaciones : null;
    const motivoModificacion = String(req.body.motivo_modificacion || '').trim();

    if (!idActividad || !calificaciones) {
        return res.status(400).json({ message: 'Debe enviar actividad y lista de calificaciones' });
    }

    const client = await pool.connect();
    try {
        await ensureSchema(client);
        await client.query('BEGIN');

        if (!(await validarAccesoActividad(client, req, idActividad))) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'No tiene permisos para registrar calificaciones en esta actividad' });
        }

        const actividad = await getActividad(client, idActividad);
        if (!actividad) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Actividad no encontrada' });
        }

        const estadoTrimestre = await validarTrimestreAbierto(client, actividad);
        if (!estadoTrimestre.abierto) {
            await client.query('ROLLBACK');
            return res.status(409).json({ message: estadoTrimestre.motivo });
        }

        const idsEstudiantes = calificaciones
            .map((item) => Number(item.id_estudiante))
            .filter((id) => Number.isInteger(id) && id > 0);

        const estudiantes = await client.query(`
            SELECT e.id_estudiante, e.estado
            FROM inscripcion i
            JOIN estudiante e ON e.id_estudiante = i.id_estudiante
            WHERE i.id_curso = $1
              AND i.estado = 'inscrito'
              AND e.id_estudiante = ANY($2::int[])
        `, [actividad.id_curso, idsEstudiantes]);

        const estudiantesMap = new Map(estudiantes.rows.map((row) => [Number(row.id_estudiante), row]));
        const valorMaximo = Number(actividad.valor_maximo);
        const cambios = [];
        const guardadas = [];

        for (const item of calificaciones) {
            const idEstudiante = Number(item.id_estudiante);
            const notaCruda = item.nota;

            if (!idEstudiante) continue;
            if (notaCruda === '' || notaCruda === null || notaCruda === undefined) continue;

            const estudiante = estudiantesMap.get(idEstudiante);
            if (!estudiante) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'La calificación contiene un estudiante que no pertenece al curso' });
            }

            if (estudiante.estado === 'retirado') {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'No se puede registrar calificación en estudiante retirado' });
            }

            const nota = Number(notaCruda);
            if (!Number.isFinite(nota) || nota < 0 || nota > valorMaximo) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    message: `La nota debe estar entre 0 y ${valorMaximo} para la actividad seleccionada`
                });
            }

            const observaciones = item.observaciones ? String(item.observaciones).trim() : null;
            const existente = await client.query(`
                SELECT id_calificacion, nota, COALESCE(observaciones, '') AS observaciones
                FROM calificacion
                WHERE id_actividad = $1
                  AND id_estudiante = $2
                FOR UPDATE
            `, [idActividad, idEstudiante]);

            if (existente.rows.length > 0) {
                const anterior = existente.rows[0];
                const notaAnterior = Number(anterior.nota);
                const observacionAnterior = anterior.observaciones || '';
                const huboCambio = notaAnterior !== nota || observacionAnterior !== (observaciones || '');

                if (huboCambio && !motivoModificacion) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ message: 'El motivo de modificación es obligatorio para cambiar notas ya guardadas' });
                }

                if (huboCambio) {
                    cambios.push({
                        id_estudiante: idEstudiante,
                        nota_anterior: notaAnterior,
                        nota_nueva: nota,
                    });
                }
            }

            const saved = await client.query(`
                INSERT INTO calificacion (id_actividad, id_estudiante, nota, fecha_evaluacion, observaciones)
                VALUES ($1, $2, $3, CURRENT_DATE, $4)
                ON CONFLICT (id_actividad, id_estudiante)
                DO UPDATE SET
                    nota = EXCLUDED.nota,
                    fecha_evaluacion = CURRENT_DATE,
                    observaciones = EXCLUDED.observaciones
                RETURNING *
            `, [idActividad, idEstudiante, nota, observaciones]);

            guardadas.push(saved.rows[0]);
        }

        await client.query('COMMIT');

        await registrarBitacora({
            id_usuario: req.usuario.id,
            nombre_modulo: 'evaluaciones',
            nombre_permiso: 'gestionar_evaluaciones',
            metodo: 'POST /api/calificaciones/actividad/:id_actividad',
            accion: cambios.length > 0 ? 'UPDATE' : 'INSERT',
            tabla_afectada: 'calificacion',
            id_registro_afectado: idActividad,
            descripcion: cambios.length > 0
                ? `Calificaciones modificadas en actividad ${idActividad}. Motivo: ${motivoModificacion}. Cambios: ${JSON.stringify(cambios)}`
                : `Calificaciones registradas en actividad ${idActividad}`,
            ip_origen: getClientIp(req),
        });

        const estudiantesConPromedio = [];
        for (const row of guardadas) {
            estudiantesConPromedio.push({
                id_estudiante: row.id_estudiante,
                promedios: await getPromediosEstudiante(pool, row.id_estudiante, actividad),
            });
        }

        res.json({
            message: 'Calificaciones guardadas correctamente',
            calificaciones: guardadas,
            modificaciones: cambios,
            promedios: estudiantesConPromedio,
        });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Error al guardar calificaciones', error: error.message });
    } finally {
        client.release();
    }
};

module.exports = {
    listarCalificacionesActividad,
    guardarCalificacionesActividad,
};
