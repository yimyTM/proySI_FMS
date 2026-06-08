const pool = require('../config/db');
const { registrarBitacora, getClientIp } = require('../utils/bitacora');

const ROLES_PROFESOR = [3, 12];
const ROLES_GESTION = [1, 2];

const isProfesor = (role) => ROLES_PROFESOR.includes(role);
const isGestion = (role) => ROLES_GESTION.includes(role);

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

const getGestionActiva = async (client = pool) => {
    const result = await client.query(
        "SELECT id_gestion, anio FROM gestion_academica WHERE estado = 'activa' LIMIT 1"
    );
    return result.rows[0] || null;
};

const ensureDimensionesOficiales = async (client, idGestion) => {
    const oficiales = [
        ['Ser', 10],
        ['Saber', 45],
        ['Hacer', 40],
        ['Autoevaluacion', 5],
    ];

    const dimensiones = [];
    for (const [nombre, puntaje] of oficiales) {
        const result = await client.query(`
            INSERT INTO dimension_evaluacion (nombre_dimension, puntaje_maximo, id_gestion)
            VALUES ($1, $2, $3)
            ON CONFLICT (nombre_dimension, id_gestion)
            DO UPDATE SET puntaje_maximo = EXCLUDED.puntaje_maximo
            RETURNING id_dimension_eval, nombre_dimension, puntaje_maximo, id_gestion
        `, [nombre, puntaje, idGestion]);
        dimensiones.push(result.rows[0]);
    }

    return dimensiones;
};

const profesorCondition = `
    (
        cm.id_profesor = (SELECT id_profesor FROM profesor WHERE id_usuario = $1)
        OR c.id_profesor = (SELECT id_profesor FROM profesor WHERE id_usuario = $1)
    )
`;

const getCursoMateria = async (client, idCursoMateria) => {
    const result = await client.query(`
        SELECT
            cm.id_curso_materia,
            cm.id_curso,
            cm.id_materia,
            cm.id_profesor,
            c.id_gestion,
            n.nombre_nivel,
            g.nombre_grado,
            c.paralelo,
            c.turno,
            m.nombre_materia
        FROM curso_materia cm
        JOIN curso c ON c.id_curso = cm.id_curso
        JOIN grado g ON g.id_grado = c.id_grado
        JOIN nivel n ON n.id_nivel = g.id_nivel
        JOIN materia m ON m.id_materia = cm.id_materia
        WHERE cm.id_curso_materia = $1
          AND c.estado = TRUE
    `, [idCursoMateria]);
    return result.rows[0] || null;
};

const validarAccesoCursoMateria = async (client, req, idCursoMateria) => {
    if (isGestion(req.usuario.role)) return true;
    if (!isProfesor(req.usuario.role)) return false;

    const result = await client.query(`
        SELECT 1
        FROM curso_materia cm
        JOIN curso c ON c.id_curso = cm.id_curso
        WHERE cm.id_curso_materia = $2
          AND ${profesorCondition}
        LIMIT 1
    `, [req.usuario.id, idCursoMateria]);
    return result.rows.length > 0;
};

const validarTrimestreAbierto = async (client, idCursoMateria, trimestre) => {
    const materiaTrimestre = await client.query(`
        INSERT INTO materia_trimestre (id_curso_materia, trimestre, estado)
        VALUES ($1, $2, 'abierto')
        ON CONFLICT (id_curso_materia, trimestre)
        DO UPDATE SET estado = materia_trimestre.estado
        RETURNING estado
    `, [idCursoMateria, trimestre]);

    if (materiaTrimestre.rows[0].estado !== 'abierto') {
        return { abierto: false, motivo: 'El trimestre está cerrado o la libreta fue aprobada' };
    }

    const contexto = await getCursoMateria(client, idCursoMateria);
    const libreta = await client.query(`
        SELECT 1
        FROM libreta_emitida
        WHERE id_curso = $1
          AND id_gestion = $2
          AND trimestre = $3
          AND estado IN ('aprobada', 'entregada')
        LIMIT 1
    `, [contexto.id_curso, contexto.id_gestion, trimestre]);

    if (libreta.rows.length > 0) {
        await client.query(`
            UPDATE materia_trimestre
            SET estado = 'libreta_aprobada',
                fecha_actualizacion = NOW()
            WHERE id_curso_materia = $1
              AND trimestre = $2
        `, [idCursoMateria, trimestre]);
        return { abierto: false, motivo: 'El trimestre está cerrado o la libreta fue aprobada' };
    }

    return { abierto: true, motivo: null };
};

const getContexto = async (req, res) => {
    try {
        await ensureSchema();
        const gestion = await getGestionActiva();
        if (!gestion) {
            return res.status(404).json({ message: 'No hay gestión académica activa' });
        }

        const params = [gestion.id_gestion];
        let filter = '';
        if (isProfesor(req.usuario.role)) {
            params.push(req.usuario.id);
            filter = `AND ${profesorCondition.replaceAll('$1', '$2')}`;
        } else if (!isGestion(req.usuario.role)) {
            return res.status(403).json({ message: 'No tiene permisos para registrar actividades de evaluación' });
        }

        const cursos = await pool.query(`
            SELECT
                c.id_curso,
                n.nombre_nivel,
                g.nombre_grado,
                c.paralelo,
                c.turno,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id_curso_materia', cm.id_curso_materia,
                            'id_materia', m.id_materia,
                            'nombre_materia', m.nombre_materia
                        )
                        ORDER BY m.nombre_materia
                    ) FILTER (WHERE cm.id_curso_materia IS NOT NULL),
                    '[]'
                ) AS materias
            FROM curso c
            JOIN grado g ON g.id_grado = c.id_grado
            JOIN nivel n ON n.id_nivel = g.id_nivel
            JOIN curso_materia cm ON cm.id_curso = c.id_curso
            JOIN materia m ON m.id_materia = cm.id_materia
            WHERE c.id_gestion = $1
              AND c.estado = TRUE
              ${filter}
            GROUP BY c.id_curso, n.nombre_nivel, g.nombre_grado, c.paralelo, c.turno
            ORDER BY n.nombre_nivel, g.nombre_grado, c.paralelo, c.turno
        `, params);

        res.json({ gestion, cursos: cursos.rows });
    } catch (error) {
        res.status(500).json({ message: 'Error al cargar contexto de actividades', error: error.message });
    }
};

const listarActividades = async (req, res) => {
    const idCursoMateria = Number(req.query.id_curso_materia);
    const trimestre = Number(req.query.trimestre || 1);

    if (!idCursoMateria || trimestre < 1 || trimestre > 3) {
        return res.status(400).json({ message: 'Debe enviar id_curso_materia y trimestre válido' });
    }

    try {
        await ensureSchema();
        if (!(await validarAccesoCursoMateria(pool, req, idCursoMateria))) {
            return res.status(403).json({ message: 'No tiene permisos para consultar esta materia' });
        }

        const contexto = await getCursoMateria(pool, idCursoMateria);
        if (!contexto) {
            return res.status(404).json({ message: 'Asignación curso-materia no encontrada' });
        }

        const dimensiones = await ensureDimensionesOficiales(pool, contexto.id_gestion);
        const estadoTrimestre = await validarTrimestreAbierto(pool, idCursoMateria, trimestre);

        const actividades = await pool.query(`
            SELECT
                ae.id_actividad,
                ae.id_curso_materia,
                ae.id_dimension_eval,
                ae.trimestre,
                ae.nombre_actividad,
                ae.fecha_actividad,
                COALESCE(ae.valor_maximo, de.puntaje_maximo) AS valor_maximo,
                de.nombre_dimension,
                de.puntaje_maximo
            FROM actividad_evaluacion ae
            JOIN dimension_evaluacion de ON de.id_dimension_eval = ae.id_dimension_eval
            WHERE ae.id_curso_materia = $1
              AND ae.trimestre = $2
            ORDER BY ae.fecha_actividad DESC NULLS LAST, ae.id_actividad DESC
        `, [idCursoMateria, trimestre]);

        res.json({
            contexto,
            trimestre,
            trimestre_abierto: estadoTrimestre.abierto,
            motivo_bloqueo: estadoTrimestre.motivo,
            dimensiones,
            actividades: actividades.rows,
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener actividades', error: error.message });
    }
};

const crearActividad = async (req, res) => {
    const {
        id_curso_materia,
        id_dimension_eval,
        trimestre,
        nombre_actividad,
        fecha_actividad,
        valor_maximo,
    } = req.body;

    if (!id_curso_materia || !id_dimension_eval || !trimestre || !nombre_actividad || valor_maximo === undefined || valor_maximo === null) {
        return res.status(400).json({ message: 'Todos los campos obligatorios deben ser completados' });
    }

    const idCursoMateria = Number(id_curso_materia);
    const idDimensionEval = Number(id_dimension_eval);
    const trimestreNum = Number(trimestre);
    const valorMaximoNum = Number(valor_maximo);

    if (trimestreNum < 1 || trimestreNum > 3) {
        return res.status(400).json({ message: 'El trimestre debe estar entre 1 y 3' });
    }

    if (!Number.isFinite(valorMaximoNum) || valorMaximoNum <= 0) {
        return res.status(400).json({ message: 'El valor máximo debe ser un número positivo' });
    }

    const client = await pool.connect();
    try {
        await ensureSchema(client);
        await client.query('BEGIN');

        if (!(await validarAccesoCursoMateria(client, req, idCursoMateria))) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'No tiene permisos para registrar actividades en esta materia' });
        }

        const contexto = await getCursoMateria(client, idCursoMateria);
        if (!contexto) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Asignación curso-materia no encontrada' });
        }

        const estadoTrimestre = await validarTrimestreAbierto(client, idCursoMateria, trimestreNum);
        if (!estadoTrimestre.abierto) {
            await client.query('ROLLBACK');
            return res.status(409).json({ message: estadoTrimestre.motivo });
        }

        const dimension = await client.query(`
            SELECT id_dimension_eval, nombre_dimension, puntaje_maximo
            FROM dimension_evaluacion
            WHERE id_dimension_eval = $1
              AND id_gestion = $2
        `, [idDimensionEval, contexto.id_gestion]);

        if (dimension.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'La dimensión no pertenece a la gestión del curso' });
        }

        if (valorMaximoNum > Number(dimension.rows[0].puntaje_maximo)) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: `El valor máximo no puede exceder ${dimension.rows[0].puntaje_maximo} para la dimensión ${dimension.rows[0].nombre_dimension}`
            });
        }

        const saved = await client.query(`
            INSERT INTO actividad_evaluacion (
                id_curso_materia,
                id_dimension_eval,
                trimestre,
                nombre_actividad,
                fecha_actividad,
                valor_maximo
            )
            VALUES ($1, $2, $3, $4, $5::date, $6)
            RETURNING *
        `, [
            idCursoMateria,
            idDimensionEval,
            trimestreNum,
            String(nombre_actividad).trim(),
            fecha_actividad || null,
            valorMaximoNum,
        ]);

        await client.query('COMMIT');

        await registrarBitacora({
            id_usuario: req.usuario.id,
            nombre_modulo: 'evaluaciones',
            nombre_permiso: 'gestionar_evaluaciones',
            metodo: 'POST /api/actividades',
            accion: 'REGISTRAR_ACTIVIDAD',
            tabla_afectada: 'actividad_evaluacion',
            id_registro_afectado: saved.rows[0].id_actividad,
            descripcion: `Actividad "${nombre_actividad}" registrada para curso-materia ${idCursoMateria}`,
            ip_origen: getClientIp(req),
        });

        res.status(201).json({
            message: 'Actividad registrada correctamente',
            actividad: saved.rows[0],
        });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Error al registrar actividad', error: error.message });
    } finally {
        client.release();
    }
};

module.exports = {
    getContexto,
    listarActividades,
    crearActividad,
};
