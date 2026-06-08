const pool = require('../config/db');
const { registrarBitacora, getClientIp } = require('../utils/bitacora');

const ESTADOS_RESOLUCION = ['aprobada', 'rechazada'];
const ROLES_PROFESOR = [3, 12];
const ROLES_REVISION = [1, 2, 4];

const isProfesor = (role) => ROLES_PROFESOR.includes(role);
const puedeRevisar = (role) => ROLES_REVISION.includes(role);

const ensureJustificacionSchema = async (client = pool) => {
    await client.query(`
        CREATE TABLE IF NOT EXISTS justificacion (
            id_justificacion SERIAL PRIMARY KEY,
            id_asistencia INTEGER NOT NULL UNIQUE REFERENCES asistencia(id_asistencia),
            id_estudiante INTEGER NOT NULL REFERENCES estudiante(id_estudiante),
            id_curso INTEGER NOT NULL REFERENCES curso(id_curso),
            fecha DATE NOT NULL,
            motivo TEXT NOT NULL,
            documento_referencia TEXT,
            observaciones TEXT,
            estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
            id_usuario_solicitante INTEGER NOT NULL REFERENCES usuario(id_usuario),
            id_usuario_revisor INTEGER REFERENCES usuario(id_usuario),
            fecha_solicitud TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
            fecha_resolucion TIMESTAMP WITHOUT TIME ZONE
        )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_justificacion_estado ON justificacion(estado)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_justificacion_estudiante_fecha ON justificacion(id_estudiante, fecha)');
};

const profesorCursoCondition = `
    (
        c.id_profesor = (SELECT id_profesor FROM profesor WHERE id_usuario = $1)
        OR EXISTS (
            SELECT 1
            FROM curso_materia cm
            JOIN profesor p ON p.id_profesor = cm.id_profesor
            WHERE cm.id_curso = c.id_curso
              AND p.id_usuario = $1
        )
    )
`;

const puedeGestionarCurso = async (client, req, idCurso) => {
    if (!isProfesor(req.usuario.role)) return true;

    const acceso = await client.query(`
        SELECT 1
        FROM curso c
        WHERE c.id_curso = $2
          AND ${profesorCursoCondition}
        LIMIT 1
    `, [req.usuario.id, idCurso]);

    return acceso.rows.length > 0;
};

const baseInasistenciasQuery = (extraWhere = '') => `
    SELECT
        a.id_asistencia,
        a.id_estudiante,
        a.id_curso,
        a.fecha,
        a.estado AS estado_asistencia,
        a.observaciones AS observacion_asistencia,
        e.nombre || ' ' || e.apellido AS estudiante,
        e.ci AS estudiante_ci,
        c.paralelo,
        c.turno,
        g.nombre_grado,
        n.nombre_nivel,
        ga.anio,
        u_reg.username AS registrado_por,
        j.id_justificacion,
        j.motivo,
        j.documento_referencia,
        j.observaciones AS observaciones_justificacion,
        j.estado AS estado_justificacion,
        j.fecha_solicitud,
        j.fecha_resolucion,
        u_sol.username AS solicitante,
        u_rev.username AS revisor
    FROM asistencia a
    JOIN estudiante e ON e.id_estudiante = a.id_estudiante
    JOIN curso c ON c.id_curso = a.id_curso
    JOIN grado g ON g.id_grado = c.id_grado
    JOIN nivel n ON n.id_nivel = g.id_nivel
    JOIN gestion_academica ga ON ga.id_gestion = c.id_gestion
    JOIN usuario u_reg ON u_reg.id_usuario = a.id_usuario_registro
    LEFT JOIN justificacion j ON j.id_asistencia = a.id_asistencia
    LEFT JOIN usuario u_sol ON u_sol.id_usuario = j.id_usuario_solicitante
    LEFT JOIN usuario u_rev ON u_rev.id_usuario = j.id_usuario_revisor
    WHERE a.estado = 'A'
      ${extraWhere}
`;

const listarInasistencias = async (req, res) => {
    await ensureJustificacionSchema();

    const { search, estado = 'todos', fecha_desde, fecha_hasta } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (isProfesor(req.usuario.role)) {
        conditions.push(`AND ${profesorCursoCondition}`);
        params.push(req.usuario.id);
        idx++;
    }
    if (search) {
        conditions.push(`AND (e.nombre || ' ' || e.apellido ILIKE $${idx} OR e.ci ILIKE $${idx} OR g.nombre_grado ILIKE $${idx})`);
        params.push(`%${search}%`);
        idx++;
    }
    if (estado !== 'todos') {
        if (estado === 'sin_solicitud') {
            conditions.push('AND j.id_justificacion IS NULL');
        } else {
            conditions.push(`AND j.estado = $${idx++}`);
            params.push(estado);
        }
    }
    if (fecha_desde) {
        conditions.push(`AND a.fecha >= $${idx++}::date`);
        params.push(fecha_desde);
    }
    if (fecha_hasta) {
        conditions.push(`AND a.fecha <= $${idx++}::date`);
        params.push(fecha_hasta);
    }

    try {
        const result = await pool.query(`
            ${baseInasistenciasQuery(conditions.join('\n'))}
            ORDER BY a.fecha DESC, e.apellido, e.nombre
        `, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al listar inasistencias', error: error.message });
    }
};

const buscarInasistencia = async (req, res) => {
    await ensureJustificacionSchema();

    const { id_estudiante, fecha } = req.query;
    if (!id_estudiante || !fecha) {
        return res.status(400).json({ message: 'El estudiante y la fecha son obligatorios' });
    }

    try {
        const result = await pool.query(`
            ${baseInasistenciasQuery('AND a.id_estudiante = $1 AND a.fecha = $2::date')}
            ORDER BY a.fecha DESC
            LIMIT 1
        `, [id_estudiante, fecha]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No se encontró inasistencia registrada para esa fecha' });
        }

        const row = result.rows[0];
        if (!(await puedeGestionarCurso(pool, req, row.id_curso))) {
            return res.status(403).json({ message: 'No tienes permiso para gestionar esta inasistencia' });
        }

        res.json(row);
    } catch (error) {
        res.status(500).json({ message: 'Error al buscar inasistencia', error: error.message });
    }
};

const registrarJustificacion = async (req, res) => {
    const { id_asistencia, motivo, documento_referencia, observaciones } = req.body;

    if (!id_asistencia || !motivo || String(motivo).trim() === '') {
        return res.status(400).json({ message: 'La asistencia y el motivo son obligatorios' });
    }

    const client = await pool.connect();
    try {
        await ensureJustificacionSchema(client);
        await client.query('BEGIN');

        const asistencia = await client.query(`
            SELECT a.id_asistencia, a.id_estudiante, a.id_curso, a.fecha, a.estado
            FROM asistencia a
            WHERE a.id_asistencia = $1
            FOR UPDATE
        `, [id_asistencia]);

        if (asistencia.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Registro de asistencia no encontrado' });
        }

        const row = asistencia.rows[0];
        if (!(await puedeGestionarCurso(client, req, row.id_curso))) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'No tienes permiso para justificar esta inasistencia' });
        }

        if (row.estado === 'J') {
            await client.query('ROLLBACK');
            return res.status(409).json({ message: 'Esta inasistencia ya fue justificada' });
        }

        if (row.estado !== 'A') {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Solo se pueden justificar registros con estado Ausente (A)' });
        }

        const existente = await client.query(
            'SELECT id_justificacion, estado FROM justificacion WHERE id_asistencia = $1',
            [id_asistencia]
        );
        if (existente.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                message: `Ya existe una justificación para esta asistencia en estado: ${existente.rows[0].estado}`
            });
        }

        const saved = await client.query(`
            INSERT INTO justificacion (
                id_asistencia,
                id_estudiante,
                id_curso,
                fecha,
                motivo,
                documento_referencia,
                observaciones,
                estado,
                id_usuario_solicitante
            )
            VALUES ($1, $2, $3, $4::date, $5, $6, $7, 'pendiente', $8)
            RETURNING *
        `, [
            row.id_asistencia,
            row.id_estudiante,
            row.id_curso,
            row.fecha,
            String(motivo).trim(),
            documento_referencia || null,
            observaciones || null,
            req.usuario.id
        ]);

        await client.query('COMMIT');

        await registrarBitacora({
            id_usuario: req.usuario.id,
            nombre_modulo: 'asistencias',
            nombre_permiso: 'registrar_asistencia',
            metodo: 'POST /api/justificaciones',
            accion: 'REGISTRAR_JUSTIFICACION',
            tabla_afectada: 'justificacion',
            id_registro_afectado: saved.rows[0].id_justificacion,
            descripcion: `Justificación registrada para asistencia ${id_asistencia}`,
            ip_origen: getClientIp(req)
        });

        res.status(201).json({
            message: 'Justificación registrada correctamente',
            justificacion: saved.rows[0]
        });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Error al registrar justificación', error: error.message });
    } finally {
        client.release();
    }
};

const listarPendientes = async (req, res) => {
    req.query.estado = 'pendiente';
    return listarJustificaciones(req, res);
};

const listarJustificaciones = async (req, res) => {
    await ensureJustificacionSchema();

    const { estado, id_estudiante, fecha_desde, fecha_hasta } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (estado) {
        conditions.push(`j.estado = $${idx++}`);
        params.push(estado);
    }
    if (id_estudiante) {
        conditions.push(`j.id_estudiante = $${idx++}`);
        params.push(id_estudiante);
    }
    if (fecha_desde) {
        conditions.push(`j.fecha >= $${idx++}::date`);
        params.push(fecha_desde);
    }
    if (fecha_hasta) {
        conditions.push(`j.fecha <= $${idx++}::date`);
        params.push(fecha_hasta);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
        const result = await pool.query(`
            SELECT
                j.*,
                e.nombre || ' ' || e.apellido AS estudiante,
                e.ci AS estudiante_ci,
                c.paralelo,
                c.turno,
                g.nombre_grado,
                n.nombre_nivel,
                u_sol.username AS solicitante,
                u_rev.username AS revisor,
                a.observaciones AS observacion_asistencia
            FROM justificacion j
            JOIN estudiante e ON e.id_estudiante = j.id_estudiante
            JOIN curso c ON c.id_curso = j.id_curso
            JOIN grado g ON g.id_grado = c.id_grado
            JOIN nivel n ON n.id_nivel = g.id_nivel
            JOIN asistencia a ON a.id_asistencia = j.id_asistencia
            JOIN usuario u_sol ON u_sol.id_usuario = j.id_usuario_solicitante
            LEFT JOIN usuario u_rev ON u_rev.id_usuario = j.id_usuario_revisor
            ${where}
            ORDER BY j.fecha_solicitud DESC
        `, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al listar justificaciones', error: error.message });
    }
};

const resolverJustificacion = async (req, res) => {
    const { id } = req.params;
    const { estado, observaciones } = req.body;

    if (!puedeRevisar(req.usuario.role)) {
        return res.status(403).json({ message: 'No tienes permiso para aprobar o rechazar justificaciones' });
    }

    if (!estado || !ESTADOS_RESOLUCION.includes(estado)) {
        return res.status(400).json({ message: 'El estado debe ser aprobada o rechazada' });
    }

    const client = await pool.connect();
    try {
        await ensureJustificacionSchema(client);
        await client.query('BEGIN');

        const check = await client.query(`
            SELECT id_justificacion, id_asistencia, id_estudiante, estado
            FROM justificacion
            WHERE id_justificacion = $1
            FOR UPDATE
        `, [id]);

        if (check.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Justificación no encontrada' });
        }

        const actual = check.rows[0];
        if (actual.estado !== 'pendiente') {
            await client.query('ROLLBACK');
            return res.status(409).json({
                message: `La justificación ya fue ${actual.estado}. Solo se pueden resolver justificaciones pendientes.`
            });
        }

        const result = await client.query(`
            UPDATE justificacion
            SET estado = $1,
                id_usuario_revisor = $2,
                fecha_resolucion = NOW(),
                observaciones = CASE
                    WHEN $3::text IS NOT NULL THEN
                        COALESCE(observaciones, '') ||
                        CASE WHEN observaciones IS NOT NULL AND observaciones <> '' THEN ' | ' ELSE '' END ||
                        $3
                    ELSE observaciones
                END
            WHERE id_justificacion = $4
            RETURNING *
        `, [estado, req.usuario.id, observaciones || null, id]);

        if (estado === 'aprobada') {
            await client.query(`
                UPDATE asistencia
                SET estado = 'J',
                    observaciones = COALESCE(observaciones, '') ||
                        CASE WHEN observaciones IS NOT NULL AND observaciones <> '' THEN ' | ' ELSE '' END ||
                        $1
                WHERE id_asistencia = $2
                  AND estado = 'A'
            `, [`Justificado por resolución #${id}`, actual.id_asistencia]);
        }

        await client.query('COMMIT');

        await registrarBitacora({
            id_usuario: req.usuario.id,
            nombre_modulo: 'asistencias',
            nombre_permiso: 'registrar_asistencia',
            metodo: 'PUT /api/justificaciones/:id/resolver',
            accion: 'EVALUAR_JUSTIFICACION',
            tabla_afectada: 'justificacion',
            id_registro_afectado: Number(id),
            descripcion: `Justificación #${id} resuelta como ${estado}`,
            ip_origen: getClientIp(req)
        });

        res.json({
            message: 'Justificación actualizada correctamente',
            justificacion: result.rows[0]
        });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Error al resolver justificación', error: error.message });
    } finally {
        client.release();
    }
};

module.exports = {
    listarInasistencias,
    buscarInasistencia,
    registrarJustificacion,
    listarPendientes,
    listarJustificaciones,
    resolverJustificacion
};
