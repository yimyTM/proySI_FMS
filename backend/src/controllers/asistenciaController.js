const pool = require('../config/db');
const { registrarBitacora, getClientIp } = require('../utils/bitacora');

const estadoMap = {
    presente: 'P',
    ausente: 'A',
    tardanza: 'T',
    justificado: 'J',
    licencia: 'L',
};

const estadoTexto = {
    P: 'presente',
    A: 'ausente',
    T: 'tardanza',
    J: 'justificado',
    L: 'licencia',
};

const normalizarEstado = (estado) => {
    if (!estado) return null;
    const value = String(estado).trim();
    return estadoMap[value.toLowerCase()] || value.toUpperCase();
};

const isProfesorRol = (role) => role === 3 || role === 12;

const todayISO = () => new Date().toISOString().slice(0, 10);

const isFutureDate = (fecha) => fecha > todayISO();

const buildResumen = (rows) => rows.reduce((acc, row) => {
    const estado = row.estado || 'P';
    acc[estado] = (acc[estado] || 0) + 1;
    return acc;
}, {});

const mapEstudianteAsistencia = (row, defaultPresente = true) => {
    const estado = row.estado || (defaultPresente ? 'P' : null);
    return {
        ...row,
        estado,
        estado_texto: estado ? estadoTexto[estado] : null
    };
};

const validarAccesoCursoProfesor = async (client, idCurso, idUsuario) => {
    const acceso = await client.query(`
        SELECT 1
        FROM curso c
        WHERE c.id_curso = $1
          AND (
            c.id_profesor = (SELECT id_profesor FROM profesor WHERE id_usuario = $2)
            OR EXISTS (
                SELECT 1
                FROM curso_materia cm
                JOIN profesor p ON p.id_profesor = cm.id_profesor
                WHERE cm.id_curso = c.id_curso
                  AND p.id_usuario = $2
            )
          )
        LIMIT 1
    `, [idCurso, idUsuario]);

    return acceso.rows.length > 0;
};

const crearNotificacionesInasistencia = async (client, {
    id_estudiante,
    id_curso,
    fecha,
    id_usuario,
}) => {
    const conteo = await client.query(`
        SELECT COUNT(*)::int AS total
        FROM asistencia
        WHERE id_estudiante = $1
          AND id_curso = $2
          AND estado = 'A'
          AND fecha BETWEEN ($3::date - INTERVAL '30 days') AND $3::date
    `, [id_estudiante, id_curso, fecha]);

    if ((conteo.rows[0]?.total || 0) < 3) {
        return 0;
    }

    const tutores = await client.query(`
        SELECT t.id_tutor,
               CASE
                 WHEN t.correo_electronico IS NOT NULL AND t.correo_electronico <> '' THEN 'email'
                 WHEN t.telefono IS NOT NULL AND t.telefono <> '' THEN 'whatsapp'
                 ELSE NULL
               END AS canal
        FROM tutor t
        JOIN tutor_estudiante te ON te.id_tutor = t.id_tutor
        WHERE te.id_estudiante = $1
          AND (t.correo_electronico IS NOT NULL OR t.telefono IS NOT NULL)
    `, [id_estudiante]);

    if (tutores.rows.length === 0) {
        return 0;
    }

    const estudiante = await client.query(
        "SELECT nombre || ' ' || apellido AS nombre_completo FROM estudiante WHERE id_estudiante = $1",
        [id_estudiante]
    );

    const titulo = `Alerta de inasistencias - estudiante ${id_estudiante} - ${fecha}`;
    const avisoExistente = await client.query(
        "SELECT id_aviso FROM aviso WHERE titulo = $1 LIMIT 1",
        [titulo]
    );

    const idAviso = avisoExistente.rows[0]?.id_aviso || (await client.query(`
        INSERT INTO aviso (
            titulo,
            contenido,
            id_usuario,
            destinatario_tipo,
            id_curso_destino,
            estado
        )
        VALUES ($1, $2, $3, 'individual', $4, 'enviado')
        RETURNING id_aviso
    `, [
        titulo,
        `El estudiante ${estudiante.rows[0]?.nombre_completo || id_estudiante} registra 3 o más inasistencias en los últimos 30 días.`,
        id_usuario,
        id_curso
    ])).rows[0].id_aviso;

    let creadas = 0;
    for (const tutor of tutores.rows) {
        if (!tutor.canal) continue;

        const existe = await client.query(
            "SELECT 1 FROM notificacion WHERE id_aviso = $1 AND id_tutor = $2 LIMIT 1",
            [idAviso, tutor.id_tutor]
        );
        if (existe.rows.length > 0) continue;

        await client.query(`
            INSERT INTO notificacion (id_aviso, id_tutor, canal, estado_envio)
            VALUES ($1, $2, $3, 'pendiente')
        `, [idAviso, tutor.id_tutor, tutor.canal]);
        creadas++;
    }

    return creadas;
};

const getCursosAsistencia = async (req, res) => {
    try {
        const params = [];
        let profesorFilter = '';

        if (isProfesorRol(req.usuario.role)) {
            profesorFilter = `
                AND (
                    c.id_profesor = (SELECT id_profesor FROM profesor WHERE id_usuario = $1)
                    OR c.id_curso IN (
                        SELECT cm.id_curso
                        FROM curso_materia cm
                        JOIN profesor p ON p.id_profesor = cm.id_profesor
                        WHERE p.id_usuario = $1
                    )
                )
            `;
            params.push(req.usuario.id);
        }

        const result = await pool.query(`
            SELECT
                c.id_curso,
                g.nombre_grado,
                n.nombre_nivel,
                c.paralelo,
                c.turno,
                ga.anio,
                COUNT(i.id_estudiante)::int AS total_estudiantes
            FROM curso c
            JOIN grado g ON g.id_grado = c.id_grado
            JOIN nivel n ON n.id_nivel = g.id_nivel
            JOIN gestion_academica ga ON ga.id_gestion = c.id_gestion
            LEFT JOIN inscripcion i ON i.id_curso = c.id_curso AND i.estado = 'inscrito'
            WHERE ga.estado = 'activa'
              AND c.estado = true
              ${profesorFilter}
            GROUP BY c.id_curso, g.nombre_grado, n.id_nivel, n.nombre_nivel, c.paralelo, c.turno, ga.anio
            ORDER BY n.id_nivel, g.nombre_grado, c.paralelo
        `, params);

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener cursos para asistencia', error: error.message });
    }
};

const getAsistenciaCurso = async (req, res) => {
    const { id_curso } = req.params;
    const { fecha = new Date().toISOString().slice(0, 10) } = req.query;

    if (isFutureDate(fecha)) {
        return res.status(400).json({ message: 'La fecha no puede ser futura' });
    }

    try {
        const cursoCheck = await pool.query(`
            SELECT c.id_curso
            FROM curso c
            JOIN gestion_academica ga ON ga.id_gestion = c.id_gestion
            WHERE c.id_curso = $1
              AND c.estado = true
              AND ga.estado = 'activa'
        `, [id_curso]);

        if (cursoCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Curso no encontrado o inactivo en la gestión vigente' });
        }

        if (isProfesorRol(req.usuario.role)) {
            const tieneAcceso = await validarAccesoCursoProfesor(pool, id_curso, req.usuario.id);
            if (!tieneAcceso) {
                return res.status(403).json({ message: 'No tienes permiso para consultar asistencia en este curso' });
            }
        }

        const estudiantes = await pool.query(`
            SELECT
                e.id_estudiante,
                e.nombre,
                e.apellido,
                e.ci,
                a.id_asistencia,
                a.estado,
                a.observaciones
            FROM inscripcion i
            JOIN estudiante e ON e.id_estudiante = i.id_estudiante
            LEFT JOIN asistencia a
              ON a.id_estudiante = e.id_estudiante
             AND a.id_curso = i.id_curso
             AND a.fecha = $2::date
            WHERE i.id_curso = $1
              AND i.estado = 'inscrito'
              AND e.estado = 'activo'
            ORDER BY e.apellido, e.nombre
        `, [id_curso, fecha]);

        if (estudiantes.rows.length === 0) {
            return res.status(404).json({ message: 'No hay estudiantes activos en este curso' });
        }

        const rows = estudiantes.rows.map(row => mapEstudianteAsistencia(row));
        const resumen = buildResumen(rows);

        res.json({
            fecha,
            id_curso: Number(id_curso),
            resumen,
            soloLectura: false,
            estudiantes: rows
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener asistencia', error: error.message });
    }
};

const consultarAsistenciaAnterior = async (req, res) => {
    const { id_curso } = req.params;
    const { fecha } = req.query;

    if (!fecha) {
        return res.status(400).json({ message: 'La fecha es requerida para consultar el historial' });
    }

    if (isFutureDate(fecha)) {
        return res.status(400).json({ message: 'La fecha no puede ser futura' });
    }

    try {
        if (isProfesorRol(req.usuario.role)) {
            const tieneAcceso = await validarAccesoCursoProfesor(pool, id_curso, req.usuario.id);
            if (!tieneAcceso) {
                return res.status(403).json({ message: 'No tienes permiso para consultar asistencia en este curso' });
            }
        }

        const registros = await pool.query(`
            SELECT
                e.id_estudiante,
                e.nombre,
                e.apellido,
                e.ci,
                a.id_asistencia,
                a.estado,
                a.observaciones,
                a.fecha_registro
            FROM asistencia a
            JOIN estudiante e ON e.id_estudiante = a.id_estudiante
            WHERE a.id_curso = $1
              AND a.fecha = $2::date
            ORDER BY e.apellido, e.nombre
        `, [id_curso, fecha]);

        if (registros.rows.length === 0) {
            return res.status(404).json({ message: 'No se encontraron registros de asistencia para la fecha solicitada' });
        }

        res.json({
            fecha,
            id_curso: Number(id_curso),
            soloLectura: true,
            resumen: buildResumen(registros.rows),
            estudiantes: registros.rows.map(row => mapEstudianteAsistencia(row, false))
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al consultar asistencia histórica', error: error.message });
    }
};

const registrarAsistencia = async (req, res) => {
    const { id_curso } = req.params;
    const { fecha, asistencias } = req.body;

    if (!fecha || !Array.isArray(asistencias)) {
        return res.status(400).json({ message: 'La fecha y la lista de asistencias son obligatorias' });
    }

    if (isFutureDate(fecha)) {
        return res.status(400).json({ message: 'La fecha no puede ser futura' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const cursoExiste = await client.query(`
            SELECT c.id_curso
            FROM curso c
            JOIN gestion_academica ga ON ga.id_gestion = c.id_gestion
            WHERE c.id_curso = $1
              AND c.estado = true
              AND ga.estado = 'activa'
        `, [id_curso]);

        if (cursoExiste.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Curso no encontrado o inactivo en la gestión vigente' });
        }

        if (isProfesorRol(req.usuario.role)) {
            const tieneAcceso = await validarAccesoCursoProfesor(client, id_curso, req.usuario.id);
            if (!tieneAcceso) {
                await client.query('ROLLBACK');
                return res.status(403).json({ message: 'No tienes permiso para registrar asistencia en este curso' });
            }
        }

        const estudiantesValidos = await client.query(`
            SELECT e.id_estudiante
            FROM inscripcion i
            JOIN estudiante e ON e.id_estudiante = i.id_estudiante
            WHERE i.id_curso = $1
              AND i.estado = 'inscrito'
              AND e.estado = 'activo'
        `, [id_curso]);
        const idsPermitidos = new Set(estudiantesValidos.rows.map(row => row.id_estudiante));

        if (idsPermitidos.size === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'No hay estudiantes activos en este curso' });
        }

        const resultado = [];
        let notificacionesCreadas = 0;
        for (const item of asistencias) {
            const estado = normalizarEstado(item.estado);
            if (!item.id_estudiante || !['P', 'A', 'T', 'J', 'L'].includes(estado)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'Cada asistencia debe incluir estudiante y estado válido' });
            }

            if (!idsPermitidos.has(Number(item.id_estudiante))) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    message: `El estudiante ${item.id_estudiante} no está activo o no se encuentra inscrito en este curso`
                });
            }

            const saved = await client.query(`
                INSERT INTO asistencia (
                    id_estudiante, id_curso, fecha, estado,
                    observaciones, id_usuario_registro
                )
                VALUES ($1, $2, $3::date, $4, $5, $6)
                ON CONFLICT (id_estudiante, id_curso, fecha)
                DO UPDATE SET
                    estado = EXCLUDED.estado,
                    observaciones = EXCLUDED.observaciones,
                    id_usuario_registro = EXCLUDED.id_usuario_registro,
                    fecha_registro = NOW()
                RETURNING *
            `, [
                item.id_estudiante,
                id_curso,
                fecha,
                estado,
                item.observaciones || null,
                req.usuario.id
            ]);

            resultado.push(saved.rows[0]);

            if (estado === 'A') {
                notificacionesCreadas += await crearNotificacionesInasistencia(client, {
                    id_estudiante: Number(item.id_estudiante),
                    id_curso: Number(id_curso),
                    fecha,
                    id_usuario: req.usuario.id,
                });
            }
        }

        await client.query('COMMIT');

        await registrarBitacora({
            id_usuario: req.usuario.id,
            nombre_modulo: 'asistencias',
            nombre_permiso: 'registrar_asistencia',
            metodo: 'POST /api/asistencias/curso/:id_curso',
            accion: 'REGISTRAR_ASISTENCIA',
            tabla_afectada: 'asistencia',
            id_registro_afectado: Number(id_curso),
            descripcion: `Registro de asistencia del curso ${id_curso} para ${fecha}`,
            ip_origen: getClientIp(req)
        });

        res.json({
            message: 'Asistencia guardada correctamente',
            asistencias: resultado,
            notificaciones_generadas: notificacionesCreadas
        });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Error al guardar asistencia', error: error.message });
    } finally {
        client.release();
    }
};

module.exports = {
    getCursosAsistencia,
    getAsistenciaCurso,
    registrarAsistencia,
    consultarAsistenciaAnterior
};
