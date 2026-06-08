const pool = require('../config/db');
const { registrarBitacora, getClientIp } = require('../utils/bitacora');

const DIMENSIONES_OFICIALES = [
    { nombre_dimension: 'Ser', puntaje_maximo: 10 },
    { nombre_dimension: 'Saber', puntaje_maximo: 45 },
    { nombre_dimension: 'Hacer', puntaje_maximo: 40 },
    { nombre_dimension: 'Autoevaluacion', puntaje_maximo: 5 },
];

const ROLES_GESTION = [1, 2];

const ensureSchema = async (client = pool) => {
    await client.query(`
        CREATE TABLE IF NOT EXISTS subpunto_evaluacion (
            id_subpunto SERIAL PRIMARY KEY,
            id_dimension_eval INTEGER NOT NULL REFERENCES dimension_evaluacion(id_dimension_eval),
            id_curso_materia INTEGER NOT NULL REFERENCES curso_materia(id_curso_materia),
            trimestre INTEGER NOT NULL CHECK (trimestre BETWEEN 1 AND 3),
            nombre VARCHAR(120) NOT NULL,
            descripcion TEXT,
            regla_promedio BOOLEAN NOT NULL DEFAULT TRUE,
            fecha_creacion TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
            UNIQUE (id_dimension_eval, id_curso_materia, trimestre, nombre)
        )
    `);
    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_subpunto_contexto
        ON subpunto_evaluacion(id_curso_materia, trimestre)
    `);
};

const getGestionActiva = async (client = pool) => {
    const result = await client.query(
        "SELECT id_gestion, anio, estado FROM gestion_academica WHERE estado = 'activa' LIMIT 1"
    );
    return result.rows[0] || null;
};

const ensureDimensionesOficiales = async (client, idGestion) => {
    const dimensiones = [];

    for (const dimension of DIMENSIONES_OFICIALES) {
        const result = await client.query(`
            INSERT INTO dimension_evaluacion (nombre_dimension, puntaje_maximo, id_gestion)
            VALUES ($1, $2, $3)
            ON CONFLICT (nombre_dimension, id_gestion)
            DO UPDATE SET puntaje_maximo = EXCLUDED.puntaje_maximo
            RETURNING id_dimension_eval, nombre_dimension, puntaje_maximo, id_gestion
        `, [dimension.nombre_dimension, dimension.puntaje_maximo, idGestion]);
        dimensiones.push(result.rows[0]);
    }

    return dimensiones.sort((a, b) => {
        const orden = DIMENSIONES_OFICIALES.map((d) => d.nombre_dimension);
        return orden.indexOf(a.nombre_dimension) - orden.indexOf(b.nombre_dimension);
    });
};

const validarRolGestion = (req, res) => {
    if (!ROLES_GESTION.includes(req.usuario.role)) {
        res.status(403).json({ message: 'Solo Director o Administrador pueden configurar dimensiones de evaluación' });
        return false;
    }
    return true;
};

const tieneCalificaciones = async (client, idCursoMateria, trimestre) => {
    const result = await client.query(`
        SELECT EXISTS (
            SELECT 1
            FROM calificacion cal
            JOIN actividad_evaluacion ae ON ae.id_actividad = cal.id_actividad
            WHERE ae.id_curso_materia = $1
              AND ae.trimestre = $2
            LIMIT 1
        ) AS tiene_notas
    `, [idCursoMateria, trimestre]);
    return Boolean(result.rows[0]?.tiene_notas);
};

const validarContextoCursoMateria = async (client, idCursoMateria, idGestion) => {
    const result = await client.query(`
        SELECT
            cm.id_curso_materia,
            cm.id_curso,
            cm.id_materia,
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
          AND c.id_gestion = $2
          AND c.estado = TRUE
    `, [idCursoMateria, idGestion]);
    return result.rows[0] || null;
};

const getContexto = async (req, res) => {
    if (!validarRolGestion(req, res)) return;

    try {
        await ensureSchema();
        const gestion = await getGestionActiva();
        if (!gestion) {
            return res.status(404).json({ message: 'No hay gestión académica activa' });
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
            LEFT JOIN curso_materia cm ON cm.id_curso = c.id_curso
            LEFT JOIN materia m ON m.id_materia = cm.id_materia
            WHERE c.id_gestion = $1
              AND c.estado = TRUE
            GROUP BY c.id_curso, n.nombre_nivel, g.nombre_grado, c.paralelo, c.turno
            ORDER BY n.nombre_nivel, g.nombre_grado, c.paralelo, c.turno
        `, [gestion.id_gestion]);

        res.json({ gestion, cursos: cursos.rows });
    } catch (error) {
        res.status(500).json({ message: 'Error al cargar contexto de evaluación', error: error.message });
    }
};

const obtenerEstructura = async (req, res) => {
    if (!validarRolGestion(req, res)) return;

    const idCursoMateria = Number(req.query.id_curso_materia);
    const trimestre = Number(req.query.trimestre || 1);

    if (!idCursoMateria || trimestre < 1 || trimestre > 3) {
        return res.status(400).json({ message: 'Debe enviar id_curso_materia y trimestre válido' });
    }

    try {
        await ensureSchema();
        const gestion = await getGestionActiva();
        if (!gestion) {
            return res.status(404).json({ message: 'No hay gestión académica activa' });
        }

        const contexto = await validarContextoCursoMateria(pool, idCursoMateria, gestion.id_gestion);
        if (!contexto) {
            return res.status(404).json({ message: 'La materia no pertenece a un curso activo de la gestión vigente' });
        }

        const dimensiones = await ensureDimensionesOficiales(pool, gestion.id_gestion);
        const subpuntos = await pool.query(`
            SELECT id_subpunto, id_dimension_eval, id_curso_materia, trimestre, nombre, descripcion, regla_promedio
            FROM subpunto_evaluacion
            WHERE id_curso_materia = $1
              AND trimestre = $2
            ORDER BY id_subpunto
        `, [idCursoMateria, trimestre]);
        const bloqueado = await tieneCalificaciones(pool, idCursoMateria, trimestre);

        res.json({
            gestion,
            contexto,
            trimestre,
            bloqueado_por_notas: bloqueado,
            dimensiones: dimensiones.map((dimension) => ({
                ...dimension,
                subpuntos: subpuntos.rows.filter((s) => s.id_dimension_eval === dimension.id_dimension_eval),
            })),
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener dimensiones', error: error.message });
    }
};

const guardarConfiguracion = async (req, res) => {
    if (!validarRolGestion(req, res)) return;

    const { id_curso_materia, trimestre, dimensiones } = req.body;
    const idCursoMateria = Number(id_curso_materia);
    const trimestreNum = Number(trimestre);

    if (!idCursoMateria || trimestreNum < 1 || trimestreNum > 3 || !Array.isArray(dimensiones)) {
        return res.status(400).json({ message: 'Debe enviar curso-materia, trimestre y dimensiones' });
    }

    const client = await pool.connect();
    try {
        await ensureSchema(client);
        await client.query('BEGIN');

        const gestion = await getGestionActiva(client);
        if (!gestion) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'No hay gestión académica activa' });
        }

        const contexto = await validarContextoCursoMateria(client, idCursoMateria, gestion.id_gestion);
        if (!contexto) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'La materia no pertenece a un curso activo de la gestión vigente' });
        }

        if (await tieneCalificaciones(client, idCursoMateria, trimestreNum)) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                message: 'No se pueden modificar sub-puntos porque ya existen calificaciones registradas para este trimestre'
            });
        }

        const dimensionesOficiales = await ensureDimensionesOficiales(client, gestion.id_gestion);
        const idsOficiales = new Set(dimensionesOficiales.map((d) => d.id_dimension_eval));

        for (const dimension of dimensiones) {
            if (!idsOficiales.has(Number(dimension.id_dimension_eval))) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'Solo se pueden configurar las dimensiones oficiales de la gestión activa' });
            }

            if ('puntaje_maximo' in dimension) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'Los porcentajes de las dimensiones están fijados por normativa' });
            }

            if (!Array.isArray(dimension.subpuntos)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'Cada dimensión debe incluir una lista de sub-puntos' });
            }

            const nombres = new Set();
            for (const subpunto of dimension.subpuntos) {
                const nombre = String(subpunto.nombre || '').trim();
                if (!nombre) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ message: 'El nombre del sub-punto es obligatorio' });
                }
                const key = nombre.toLowerCase();
                if (nombres.has(key)) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ message: `No puede repetir el sub-punto "${nombre}" dentro de la misma dimensión` });
                }
                nombres.add(key);
            }
        }

        await client.query(`
            DELETE FROM subpunto_evaluacion
            WHERE id_curso_materia = $1
              AND trimestre = $2
              AND id_dimension_eval = ANY($3::int[])
        `, [idCursoMateria, trimestreNum, Array.from(idsOficiales)]);

        const guardados = [];
        for (const dimension of dimensiones) {
            for (const subpunto of dimension.subpuntos) {
                const saved = await client.query(`
                    INSERT INTO subpunto_evaluacion (
                        id_dimension_eval,
                        id_curso_materia,
                        trimestre,
                        nombre,
                        descripcion,
                        regla_promedio
                    )
                    VALUES ($1, $2, $3, $4, $5, TRUE)
                    RETURNING *
                `, [
                    Number(dimension.id_dimension_eval),
                    idCursoMateria,
                    trimestreNum,
                    String(subpunto.nombre).trim(),
                    String(subpunto.descripcion || '').trim() || null,
                ]);
                guardados.push(saved.rows[0]);
            }
        }

        await client.query('COMMIT');

        await registrarBitacora({
            id_usuario: req.usuario.id,
            nombre_modulo: 'evaluaciones',
            nombre_permiso: 'gestionar_evaluaciones',
            metodo: 'POST /api/dimensiones/configuracion',
            accion: 'CONFIGURAR_DIMENSIONES',
            tabla_afectada: 'subpunto_evaluacion',
            id_registro_afectado: idCursoMateria,
            descripcion: `Configuración de sub-puntos para curso-materia ${idCursoMateria}, trimestre ${trimestreNum}`,
            ip_origen: getClientIp(req),
        });

        res.json({
            message: 'Estructura guardada correctamente',
            subpuntos: guardados,
        });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Error al guardar configuración de dimensiones', error: error.message });
    } finally {
        client.release();
    }
};

module.exports = {
    getContexto,
    obtenerEstructura,
    guardarConfiguracion,
};
