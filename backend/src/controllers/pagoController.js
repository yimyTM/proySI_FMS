const pool = require('../config/db');
const crypto = require('crypto');
const { registrarBitacora, getClientIp } = require('../utils/bitacora');

const STRIPE_API_URL = 'https://api.stripe.com/v1';

const MESES = [
    { numero: 1, nombre: 'enero' },
    { numero: 2, nombre: 'febrero' },
    { numero: 3, nombre: 'marzo' },
    { numero: 4, nombre: 'abril' },
    { numero: 5, nombre: 'mayo' },
    { numero: 6, nombre: 'junio' },
    { numero: 7, nombre: 'julio' },
    { numero: 8, nombre: 'agosto' },
    { numero: 9, nombre: 'septiembre' },
    { numero: 10, nombre: 'octubre' },
    { numero: 11, nombre: 'noviembre' },
    { numero: 12, nombre: 'diciembre' },
];

const ensureDeudaAutomaticaSchema = async (client = pool) => {
    await client.query(`
        CREATE TABLE IF NOT EXISTS nivel_arancel (
            id_arancel SERIAL PRIMARY KEY,
            id_nivel INTEGER NOT NULL REFERENCES nivel(id_nivel),
            monto_mensual NUMERIC(10,2) NOT NULL CHECK (monto_mensual >= 0),
            estado BOOLEAN NOT NULL DEFAULT TRUE,
            fecha_actualizacion TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
            UNIQUE (id_nivel)
        )
    `);

    await client.query(`
        INSERT INTO nivel_arancel (id_nivel, monto_mensual, estado)
        SELECT id_nivel, monto_mensualidad, TRUE
        FROM nivel
        ON CONFLICT (id_nivel)
        DO UPDATE SET
            monto_mensual = CASE
                WHEN nivel_arancel.monto_mensual = 0 THEN EXCLUDED.monto_mensual
                ELSE nivel_arancel.monto_mensual
            END
    `);
};

const ensureStripePagoSchema = async (client = pool) => {
    await client.query(`
        ALTER TABLE pago
        ADD COLUMN IF NOT EXISTS id_stripe_payment VARCHAR(120),
        ADD COLUMN IF NOT EXISTS stripe_status VARCHAR(50),
        ADD COLUMN IF NOT EXISTS stripe_payload JSONB,
        ADD COLUMN IF NOT EXISTS numero_comprobante VARCHAR(120)
    `);

    await client.query(`
        CREATE TABLE IF NOT EXISTS estudiante_usuario (
            id_estudiante INTEGER NOT NULL REFERENCES estudiante(id_estudiante),
            id_usuario INTEGER NOT NULL REFERENCES usuario(id_usuario),
            fecha_vinculacion TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
            PRIMARY KEY (id_estudiante, id_usuario),
            UNIQUE (id_usuario)
        )
    `);

    await client.query(`
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'pago_estado_check'
            ) THEN
                ALTER TABLE pago DROP CONSTRAINT pago_estado_check;
            END IF;

            IF EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'pago_metodo_pago_check'
            ) THEN
                ALTER TABLE pago DROP CONSTRAINT pago_metodo_pago_check;
            END IF;
        END $$;
    `);

    await client.query(`
        ALTER TABLE pago
        ADD CONSTRAINT pago_estado_check
        CHECK (estado IN ('pendiente_validacion', 'validado', 'rechazado', 'completado', 'fallido'))
    `);

    await client.query(`
        ALTER TABLE pago
        ADD CONSTRAINT pago_metodo_pago_check
        CHECK (metodo_pago IN ('efectivo', 'QR', 'transferencia', 'stripe'))
    `);

    await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_pago_stripe_payment
        ON pago (id_stripe_payment)
        WHERE id_stripe_payment IS NOT NULL
    `);

    await client.query(`
        CREATE OR REPLACE FUNCTION fn_actualizar_deuda_al_pagar() RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
            IF NEW.estado IN ('validado', 'completado') THEN
                UPDATE deuda
                SET estado = 'pagado'
                WHERE id_deuda = NEW.id_deuda;
            END IF;

            RETURN NEW;
        END;
        $$;
    `);
};

const normalizarPeriodo = (mes, anio) => {
    const anioNum = Number(anio);
    let mesNum = Number(mes);

    if (!mesNum && typeof mes === 'string') {
        const index = MESES.findIndex((item) => item.nombre === mes.trim().toLowerCase());
        mesNum = index >= 0 ? index + 1 : NaN;
    }

    const mesInfo = MESES.find((item) => item.numero === mesNum);
    if (!Number.isInteger(anioNum) || anioNum < 2000 || anioNum > 2100 || !mesInfo) {
        return null;
    }

    return { mes_numero: mesNum, mes_nombre: mesInfo.nombre, anio: anioNum };
};

const getConceptoMensualidad = async (client = pool) => {
    const result = await client.query(`
        INSERT INTO concepto_pago (nombre_concepto, descripcion)
        VALUES ('Mensualidad', 'Pago mensual')
        ON CONFLICT (nombre_concepto)
        DO UPDATE SET descripcion = COALESCE(concepto_pago.descripcion, EXCLUDED.descripcion)
        RETURNING id_concepto, nombre_concepto
    `);

    return result.rows[0];
};

const stripeRequest = async (path, { method = 'GET', body = null, idempotencyKey = null } = {}) => {
    if (!process.env.STRIPE_SECRET_KEY) {
        const error = new Error('Stripe no está configurado');
        error.status = 503;
        throw error;
    }

    const headers = {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
    };

    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const options = { method, headers };
    if (body) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        options.body = new URLSearchParams(body);
    }

    const response = await fetch(`${STRIPE_API_URL}${path}`, options);
    const data = await response.json();
    if (!response.ok) {
        const error = new Error(data.error?.message || 'Error de Stripe');
        error.status = response.status;
        error.stripe = data.error;
        throw error;
    }

    return data;
};

const verificarFirmaStripe = (req) => {
    if (!process.env.STRIPE_WEBHOOK_SECRET) return true;

    const signature = req.headers['stripe-signature'];
    if (!signature || !req.rawBody) return false;

    const parts = String(signature).split(',').reduce((acc, item) => {
        const [key, value] = item.split('=');
        acc[key] = value;
        return acc;
    }, {});

    if (!parts.t || !parts.v1) return false;

    const signedPayload = `${parts.t}.${req.rawBody}`;
    const expected = crypto
        .createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
        .update(signedPayload)
        .digest('hex');

    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(parts.v1);
    if (expectedBuffer.length !== receivedBuffer.length) return false;

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

const resolverEstudianteUsuario = async (client, req, idEstudianteSolicitado = null) => {
    if ([1, 2, 4].includes(req.usuario.role) && idEstudianteSolicitado) {
        return Number(idEstudianteSolicitado);
    }

    const vinculo = await client.query(`
        SELECT id_estudiante
        FROM estudiante_usuario
        WHERE id_usuario = $1
        LIMIT 1
    `, [req.usuario.id]);

    if (vinculo.rows.length > 0) return Number(vinculo.rows[0].id_estudiante);

    const porPerfil = await client.query(`
        SELECT e.id_estudiante
        FROM estudiante e
        JOIN usuario u ON u.id_usuario = $1
        WHERE e.ci = u.username
           OR e.ci = u.email
        LIMIT 1
    `, [req.usuario.id]);

    if (porPerfil.rows.length > 0) return Number(porPerfil.rows[0].id_estudiante);

    return null;
};

const registrarPagoStripeCompletado = async (client, paymentIntent) => {
    await ensureStripePagoSchema(client);

    const idDeuda = Number(paymentIntent.metadata?.id_deuda);
    const idEstudiante = Number(paymentIntent.metadata?.id_estudiante);
    const idUsuario = Number(paymentIntent.metadata?.id_usuario || 1);
    const monto = Number(paymentIntent.amount_received || paymentIntent.amount || 0) / 100;

    if (!idDeuda || !idEstudiante || monto <= 0) {
        throw new Error('PaymentIntent sin metadatos suficientes para registrar pago');
    }

    const comprobante = `STRIPE-${paymentIntent.id}`;
    const saved = await client.query(`
        INSERT INTO pago (
            id_deuda,
            id_estudiante,
            monto_pagado,
            metodo_pago,
            comprobante_url,
            estado,
            id_usuario_registro,
            observaciones,
            id_stripe_payment,
            stripe_status,
            stripe_payload,
            numero_comprobante
        )
        VALUES ($1, $2, $3, 'stripe', $4, 'completado', $5, $6, $7, $8, $9::jsonb, $10)
        ON CONFLICT (id_stripe_payment)
        DO UPDATE SET
            estado = 'completado',
            stripe_status = EXCLUDED.stripe_status,
            stripe_payload = EXCLUDED.stripe_payload,
            fecha_pago = NOW()
        RETURNING *
    `, [
        idDeuda,
        idEstudiante,
        monto,
        paymentIntent.charges?.data?.[0]?.receipt_url || null,
        idUsuario,
        `Pago completado por Stripe. Transacción ${paymentIntent.id}`,
        paymentIntent.id,
        paymentIntent.status,
        JSON.stringify(paymentIntent),
        comprobante,
    ]);

    await client.query(`
        UPDATE deuda
        SET estado = 'pagado'
        WHERE id_deuda = $1
    `, [idDeuda]);

    return saved.rows[0];
};

const getConceptos = async (_req, res) => {
    try {
        const result = await pool.query('SELECT * FROM concepto_pago ORDER BY nombre_concepto');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener conceptos de pago', error: error.message });
    }
};

const getContextoGeneracionDeudas = async (_req, res) => {
    try {
        await ensureDeudaAutomaticaSchema();

        const gestion = await pool.query(`
            SELECT id_gestion, anio, estado
            FROM gestion_academica
            WHERE estado = 'activa'
            ORDER BY anio DESC
            LIMIT 1
        `);

        const aranceles = await pool.query(`
            SELECT
                n.id_nivel,
                n.nombre_nivel,
                COALESCE(na.monto_mensual, n.monto_mensualidad) AS monto_mensual,
                COALESCE(na.estado, TRUE) AS estado
            FROM nivel n
            LEFT JOIN nivel_arancel na ON na.id_nivel = n.id_nivel
            ORDER BY n.nombre_nivel
        `);

        const now = new Date();
        res.json({
            gestion_activa: gestion.rows[0] || null,
            periodo_actual: {
                mes_numero: now.getMonth() + 1,
                mes_nombre: MESES[now.getMonth()].nombre,
                anio: now.getFullYear(),
            },
            meses: MESES,
            aranceles: aranceles.rows,
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al cargar contexto de generación de deudas', error: error.message });
    }
};

const createConcepto = async (req, res) => {
    const { nombre_concepto, descripcion } = req.body;

    if (!nombre_concepto) {
        return res.status(400).json({ message: 'El nombre del concepto es obligatorio' });
    }

    try {
        const result = await pool.query(`
            INSERT INTO concepto_pago (nombre_concepto, descripcion)
            VALUES ($1, $2)
            ON CONFLICT (nombre_concepto)
            DO UPDATE SET descripcion = EXCLUDED.descripcion
            RETURNING *
        `, [nombre_concepto, descripcion || null]);

        res.status(201).json({ message: 'Concepto guardado correctamente', concepto: result.rows[0] });
    } catch (error) {
        res.status(500).json({ message: 'Error al guardar concepto', error: error.message });
    }
};

const getDeudas = async (req, res) => {
    const { search, estado, id_estudiante, id_gestion } = req.query;

    try {
        const conditions = [];
        const params = [];
        let idx = 1;

        if (search) {
            conditions.push(`(e.nombre || ' ' || e.apellido ILIKE $${idx} OR e.ci ILIKE $${idx} OR cp.nombre_concepto ILIKE $${idx})`);
            params.push(`%${search}%`);
            idx++;
        }
        if (estado) {
            conditions.push(`d.estado = $${idx++}`);
            params.push(estado);
        }
        if (id_estudiante) {
            conditions.push(`d.id_estudiante = $${idx++}`);
            params.push(id_estudiante);
        }
        if (id_gestion) {
            conditions.push(`d.id_gestion = $${idx++}`);
            params.push(id_gestion);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const result = await pool.query(`
            SELECT
                d.id_deuda,
                d.id_estudiante,
                e.nombre || ' ' || e.apellido AS estudiante,
                e.ci AS estudiante_ci,
                d.id_gestion,
                ga.anio,
                d.id_concepto,
                cp.nombre_concepto,
                d.monto,
                d.mes,
                d.estado AS estado_deuda,
                d.fecha_generacion,
                p.id_pago,
                p.monto_pagado,
                p.metodo_pago,
                p.estado AS estado_pago,
                p.fecha_pago,
                p.observaciones,
                p.id_stripe_payment,
                p.stripe_status,
                p.numero_comprobante,
                p.comprobante_url
            FROM deuda d
            JOIN estudiante e ON e.id_estudiante = d.id_estudiante
            JOIN gestion_academica ga ON ga.id_gestion = d.id_gestion
            JOIN concepto_pago cp ON cp.id_concepto = d.id_concepto
            LEFT JOIN LATERAL (
                SELECT *
                FROM pago p
                WHERE p.id_deuda = d.id_deuda
                ORDER BY p.fecha_pago DESC
                LIMIT 1
            ) p ON TRUE
            ${where}
            ORDER BY d.fecha_generacion DESC, e.apellido, e.nombre
        `, params);

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener deudas', error: error.message });
    }
};

const getMisPagos = async (req, res) => {
    try {
        await ensureStripePagoSchema();

        const idEstudiante = await resolverEstudianteUsuario(pool, req, req.query.id_estudiante);
        if (!idEstudiante) {
            return res.status(404).json({ message: 'No se encontró un estudiante vinculado a este usuario' });
        }

        const result = await pool.query(`
            SELECT
                d.id_deuda,
                d.id_estudiante,
                e.nombre || ' ' || e.apellido AS estudiante,
                d.id_gestion,
                ga.anio,
                d.id_concepto,
                cp.nombre_concepto,
                d.monto,
                d.mes,
                d.estado AS estado_deuda,
                d.fecha_generacion,
                p.id_pago,
                p.monto_pagado,
                p.metodo_pago,
                p.estado AS estado_pago,
                p.fecha_pago,
                p.id_stripe_payment,
                p.stripe_status,
                p.numero_comprobante,
                p.comprobante_url
            FROM deuda d
            JOIN estudiante e ON e.id_estudiante = d.id_estudiante
            JOIN gestion_academica ga ON ga.id_gestion = d.id_gestion
            JOIN concepto_pago cp ON cp.id_concepto = d.id_concepto
            LEFT JOIN LATERAL (
                SELECT *
                FROM pago p
                WHERE p.id_deuda = d.id_deuda
                ORDER BY p.fecha_pago DESC
                LIMIT 1
            ) p ON TRUE
            WHERE d.id_estudiante = $1
            ORDER BY
                CASE d.estado WHEN 'pendiente' THEN 1 WHEN 'mora' THEN 2 WHEN 'pagado' THEN 3 ELSE 4 END,
                d.fecha_generacion DESC
        `, [idEstudiante]);

        res.json({
            id_estudiante: idEstudiante,
            stripe_public_key: process.env.STRIPE_PUBLIC_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null,
            deudas: result.rows,
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener pagos del estudiante', error: error.message });
    }
};

const createDeuda = async (req, res) => {
    const { id_estudiante, id_gestion, id_concepto, monto, mes } = req.body;

    if (!id_estudiante || !id_gestion || !id_concepto || !monto || !mes) {
        return res.status(400).json({ message: 'Estudiante, gestion, concepto, monto y mes son obligatorios' });
    }

    try {
        const result = await pool.query(`
            INSERT INTO deuda (id_estudiante, id_gestion, id_concepto, monto, mes)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [id_estudiante, id_gestion, id_concepto, Number(monto), mes]);

        res.status(201).json({ message: 'Deuda generada correctamente', deuda: result.rows[0] });
    } catch (error) {
        const status = error.code === '23505' ? 409 : 500;
        res.status(status).json({ message: 'Error al generar deuda', error: error.message });
    }
};

const crearPaymentIntent = async (req, res) => {
    const idDeuda = Number(req.body.id_deuda);

    if (!idDeuda) {
        return res.status(400).json({ message: 'Debe seleccionar una deuda válida' });
    }

    const client = await pool.connect();
    try {
        await ensureStripePagoSchema(client);

        const idEstudiante = await resolverEstudianteUsuario(client, req, req.body.id_estudiante);
        if (!idEstudiante) {
            return res.status(404).json({ message: 'No se encontró un estudiante vinculado a este usuario' });
        }

        const deuda = await client.query(`
            SELECT
                d.id_deuda,
                d.id_estudiante,
                d.monto,
                d.mes,
                d.estado,
                ga.anio,
                cp.nombre_concepto
            FROM deuda d
            JOIN gestion_academica ga ON ga.id_gestion = d.id_gestion
            JOIN concepto_pago cp ON cp.id_concepto = d.id_concepto
            WHERE d.id_deuda = $1
              AND d.id_estudiante = $2
        `, [idDeuda, idEstudiante]);

        if (deuda.rows.length === 0) {
            return res.status(404).json({ message: 'Deuda no encontrada para el estudiante' });
        }

        const row = deuda.rows[0];
        if (row.estado === 'pagado') {
            const pago = await client.query(`
                SELECT id_pago, id_stripe_payment, monto_pagado, fecha_pago, numero_comprobante
                FROM pago
                WHERE id_deuda = $1
                  AND estado IN ('validado', 'completado')
                ORDER BY fecha_pago DESC
                LIMIT 1
            `, [idDeuda]);

            return res.status(409).json({
                message: 'La deuda ya está pagada',
                comprobante: pago.rows[0] || null,
            });
        }

        const existente = await client.query(`
            SELECT id_stripe_payment
            FROM pago
            WHERE id_deuda = $1
              AND metodo_pago = 'stripe'
              AND estado = 'pendiente_validacion'
              AND id_stripe_payment IS NOT NULL
            ORDER BY fecha_pago DESC
            LIMIT 1
        `, [idDeuda]);

        if (existente.rows.length > 0) {
            const intent = await stripeRequest(`/payment_intents/${existente.rows[0].id_stripe_payment}`);
            if (!['succeeded', 'canceled'].includes(intent.status)) {
                return res.json({
                    client_secret: intent.client_secret,
                    payment_intent_id: intent.id,
                    stripe_public_key: process.env.STRIPE_PUBLIC_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null,
                });
            }
        }

        const amount = Math.round(Number(row.monto) * 100);
        const idempotencyKey = `deuda-${idDeuda}-${idEstudiante}-${row.mes}-${row.anio}`;
        const intent = await stripeRequest('/payment_intents', {
            method: 'POST',
            idempotencyKey,
            body: {
                amount: String(amount),
                currency: (process.env.STRIPE_CURRENCY || 'bob').toLowerCase(),
                'automatic_payment_methods[enabled]': 'true',
                description: `${row.nombre_concepto} ${row.mes} ${row.anio}`,
                'metadata[id_deuda]': String(idDeuda),
                'metadata[id_estudiante]': String(idEstudiante),
                'metadata[id_usuario]': String(req.usuario.id),
                'metadata[periodo]': `${row.mes}/${row.anio}`,
            }
        });

        await client.query(`
            INSERT INTO pago (
                id_deuda,
                id_estudiante,
                monto_pagado,
                metodo_pago,
                estado,
                id_usuario_registro,
                observaciones,
                id_stripe_payment,
                stripe_status,
                stripe_payload
            )
            VALUES ($1, $2, $3, 'stripe', 'pendiente_validacion', $4, $5, $6, $7, $8::jsonb)
            ON CONFLICT (id_stripe_payment)
            DO UPDATE SET
                stripe_status = EXCLUDED.stripe_status,
                stripe_payload = EXCLUDED.stripe_payload
            RETURNING *
        `, [
            idDeuda,
            idEstudiante,
            Number(row.monto),
            req.usuario.id,
            `PaymentIntent creado en Stripe para ${row.nombre_concepto} ${row.mes}/${row.anio}`,
            intent.id,
            intent.status,
            JSON.stringify(intent),
        ]);

        await registrarBitacora({
            id_usuario: req.usuario.id,
            nombre_modulo: 'pagos',
            nombre_permiso: 'gestionar_pagos',
            metodo: 'POST /api/pagos/stripe/payment-intent',
            accion: 'INSERT',
            tabla_afectada: 'pago',
            id_registro_afectado: idDeuda,
            descripcion: `PaymentIntent ${intent.id} creado para deuda ${idDeuda}`,
            ip_origen: getClientIp(req)
        });

        res.json({
            client_secret: intent.client_secret,
            payment_intent_id: intent.id,
            stripe_public_key: process.env.STRIPE_PUBLIC_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null,
        });
    } catch (error) {
        const status = error.status || 500;
        res.status(status).json({
            message: status === 503
                ? 'No se pudo iniciar el proceso de pago. Stripe no está configurado'
                : 'No se pudo iniciar el proceso de pago. Intente nuevamente',
            error: error.message,
            stripe_error: error.stripe || null,
        });
    } finally {
        client.release();
    }
};

const generarDeudasMensuales = async (req, res) => {
    const periodo = normalizarPeriodo(req.body.mes, req.body.anio);

    if (!periodo) {
        return res.status(400).json({ message: 'Debe seleccionar un mes y año válidos' });
    }

    const client = await pool.connect();

    try {
        await ensureDeudaAutomaticaSchema(client);
        await client.query('BEGIN');

        const gestion = await client.query(`
            SELECT id_gestion, anio
            FROM gestion_academica
            WHERE estado = 'activa'
              AND anio = $1
            LIMIT 1
        `, [periodo.anio]);

        if (gestion.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'No hay gestión académica activa para el período seleccionado' });
        }

        const gestionActiva = gestion.rows[0];
        const concepto = await getConceptoMensualidad(client);

        const estudiantes = await client.query(`
            SELECT DISTINCT ON (e.id_estudiante)
                e.id_estudiante,
                e.nombre,
                e.apellido,
                n.id_nivel,
                n.nombre_nivel,
                COALESCE(na.monto_mensual, n.monto_mensualidad) AS monto_mensual,
                COALESCE(na.estado, TRUE) AS arancel_activo
            FROM inscripcion i
            JOIN estudiante e ON e.id_estudiante = i.id_estudiante
            JOIN curso c ON c.id_curso = i.id_curso
            JOIN grado g ON g.id_grado = c.id_grado
            JOIN nivel n ON n.id_nivel = g.id_nivel
            LEFT JOIN nivel_arancel na ON na.id_nivel = n.id_nivel
            WHERE i.estado = 'inscrito'
              AND e.estado = 'activo'
              AND c.id_gestion = $1
              AND c.estado = TRUE
            ORDER BY e.id_estudiante, i.fecha_inscripcion DESC
        `, [gestionActiva.id_gestion]);

        if (estudiantes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'No hay estudiantes activos para generar deudas' });
        }

        const resumen = {
            periodo: `${periodo.mes_nombre}/${periodo.anio}`,
            generadas: 0,
            omitidas_existentes: 0,
            omitidas_arancel: 0,
            errores: [],
            total_estudiantes: estudiantes.rows.length,
        };

        for (const estudiante of estudiantes.rows) {
            const monto = Number(estudiante.monto_mensual);
            if (!estudiante.arancel_activo || !Number.isFinite(monto) || monto <= 0) {
                resumen.omitidas_arancel++;
                resumen.errores.push({
                    id_estudiante: estudiante.id_estudiante,
                    estudiante: `${estudiante.apellido} ${estudiante.nombre}`,
                    nivel: estudiante.nombre_nivel,
                    motivo: 'Arancel no configurado',
                });
                continue;
            }

            const existente = await client.query(`
                SELECT id_deuda
                FROM deuda
                WHERE id_estudiante = $1
                  AND id_gestion = $2
                  AND id_concepto = $3
                  AND lower(mes) = lower($4)
                LIMIT 1
            `, [estudiante.id_estudiante, gestionActiva.id_gestion, concepto.id_concepto, periodo.mes_nombre]);

            if (existente.rows.length > 0) {
                resumen.omitidas_existentes++;
                continue;
            }

            await client.query(`
                INSERT INTO deuda (
                    id_estudiante,
                    id_gestion,
                    id_concepto,
                    monto,
                    mes,
                    estado,
                    fecha_generacion
                )
                VALUES ($1, $2, $3, $4, $5, 'pendiente', NOW())
            `, [
                estudiante.id_estudiante,
                gestionActiva.id_gestion,
                concepto.id_concepto,
                monto,
                periodo.mes_nombre,
            ]);

            resumen.generadas++;
        }

        await client.query('COMMIT');

        await registrarBitacora({
            id_usuario: req.usuario?.id || null,
            nombre_modulo: 'pagos',
            nombre_permiso: 'gestionar_pagos',
            metodo: 'POST /api/pagos/deudas/generar-mensual',
            accion: 'INSERT',
            tabla_afectada: 'deuda',
            descripcion: `Generación automática de deudas ${resumen.periodo}: ${resumen.generadas} generadas, ${resumen.omitidas_existentes} existentes, ${resumen.omitidas_arancel} sin arancel`,
            ip_origen: getClientIp(req)
        });

        res.status(201).json({
            message: resumen.generadas > 0
                ? 'Deudas mensuales generadas correctamente'
                : 'No se generaron deudas nuevas para el período seleccionado',
            resumen,
        });
    } catch (error) {
        await client.query('ROLLBACK');

        await registrarBitacora({
            id_usuario: req.usuario?.id || null,
            nombre_modulo: 'pagos',
            nombre_permiso: 'gestionar_pagos',
            metodo: 'POST /api/pagos/deudas/generar-mensual',
            accion: 'SISTEMA',
            tabla_afectada: 'deuda',
            descripcion: `Error al generar deudas automáticas: ${error.message}`,
            ip_origen: getClientIp(req)
        });

        res.status(500).json({ message: 'Error de base de datos durante la generación de deudas', error: error.message });
    } finally {
        client.release();
    }
};

const registrarPago = async (req, res) => {
    const { id_deuda, monto_pagado, metodo_pago, estado = 'validado', comprobante_url, observaciones } = req.body;

    if (!id_deuda || !monto_pagado || !metodo_pago) {
        return res.status(400).json({ message: 'Deuda, monto y metodo de pago son obligatorios' });
    }

    try {
        const deuda = await pool.query('SELECT id_estudiante FROM deuda WHERE id_deuda = $1', [id_deuda]);
        if (deuda.rows.length === 0) {
            return res.status(404).json({ message: 'Deuda no encontrada' });
        }

        const result = await pool.query(`
            INSERT INTO pago (
                id_deuda, id_estudiante, monto_pagado, metodo_pago,
                comprobante_url, estado, id_usuario_registro, observaciones
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [
            id_deuda,
            deuda.rows[0].id_estudiante,
            Number(monto_pagado),
            metodo_pago,
            comprobante_url || null,
            estado,
            req.usuario.id,
            observaciones || null
        ]);

        await registrarBitacora({
            id_usuario: req.usuario.id,
            nombre_modulo: 'pagos',
            nombre_permiso: 'gestionar_pagos',
            metodo: 'POST /api/pagos',
            accion: 'REGISTRAR_PAGO',
            tabla_afectada: 'pago',
            id_registro_afectado: result.rows[0].id_pago,
            descripcion: `Registro de pago para deuda ${id_deuda}`,
            ip_origen: getClientIp(req)
        });

        res.status(201).json({ message: 'Pago registrado correctamente', pago: result.rows[0] });
    } catch (error) {
        res.status(500).json({ message: 'Error al registrar pago', error: error.message });
    }
};

const getPagosRegistrados = async (req, res) => {
    const { search, estado, periodo } = req.query;

    try {
        await ensureStripePagoSchema();
        const conditions = [];
        const params = [];
        let idx = 1;

        if (search) {
            conditions.push(`(e.nombre || ' ' || e.apellido ILIKE $${idx} OR e.ci ILIKE $${idx} OR p.id_stripe_payment ILIKE $${idx})`);
            params.push(`%${search}%`);
            idx++;
        }

        if (estado && estado !== 'todos') {
            conditions.push(`p.estado = $${idx++}`);
            params.push(estado);
        }

        if (periodo) {
            conditions.push(`(lower(d.mes) || '/' || ga.anio::text) = lower($${idx++})`);
            params.push(periodo);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const result = await pool.query(`
            SELECT
                p.id_pago,
                p.id_deuda,
                p.id_estudiante,
                e.nombre || ' ' || e.apellido AS estudiante,
                e.ci AS estudiante_ci,
                p.monto_pagado,
                p.metodo_pago,
                p.estado AS estado_pago,
                p.fecha_pago,
                p.id_stripe_payment,
                p.stripe_status,
                p.numero_comprobante,
                p.comprobante_url,
                d.mes,
                ga.anio,
                d.estado AS estado_deuda,
                cp.nombre_concepto
            FROM pago p
            JOIN deuda d ON d.id_deuda = p.id_deuda
            JOIN estudiante e ON e.id_estudiante = p.id_estudiante
            JOIN gestion_academica ga ON ga.id_gestion = d.id_gestion
            JOIN concepto_pago cp ON cp.id_concepto = d.id_concepto
            ${where}
            ORDER BY p.fecha_pago DESC
        `, params);

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al consultar pagos registrados', error: error.message });
    }
};

const sincronizarPagoStripe = async (req, res) => {
    const paymentIntentId = req.body.payment_intent_id || req.body.id_stripe_payment;
    const idPago = req.body.id_pago;

    if (!paymentIntentId && !idPago) {
        return res.status(400).json({ message: 'Debe enviar id de pago o PaymentIntent de Stripe' });
    }

    const client = await pool.connect();
    try {
        await ensureStripePagoSchema(client);

        let stripeId = paymentIntentId;
        if (!stripeId) {
            const pago = await client.query('SELECT id_stripe_payment FROM pago WHERE id_pago = $1', [idPago]);
            if (pago.rows.length === 0 || !pago.rows[0].id_stripe_payment) {
                return res.status(404).json({ message: 'Pago Stripe no encontrado' });
            }
            stripeId = pago.rows[0].id_stripe_payment;
        }

        const intent = await stripeRequest(`/payment_intents/${stripeId}`);
        await client.query('BEGIN');

        let pago = null;
        if (intent.status === 'succeeded') {
            pago = await registrarPagoStripeCompletado(client, intent);
        } else {
            await client.query(`
                UPDATE pago
                SET estado = $1,
                    stripe_status = $2,
                    stripe_payload = $3::jsonb,
                    observaciones = $4
                WHERE id_stripe_payment = $5
            `, [
                intent.status === 'requires_payment_method' ? 'fallido' : 'pendiente_validacion',
                intent.status,
                JSON.stringify(intent),
                intent.last_payment_error?.message || `Stripe status: ${intent.status}`,
                stripeId,
            ]);
        }

        await client.query('COMMIT');

        await registrarBitacora({
            id_usuario: req.usuario.id,
            nombre_modulo: 'pagos',
            nombre_permiso: 'gestionar_pagos',
            metodo: 'POST /api/pagos/stripe/sincronizar',
            accion: 'UPDATE',
            tabla_afectada: 'pago',
            id_registro_afectado: pago?.id_pago || idPago || null,
            descripcion: `Sincronización Stripe ${stripeId}: ${intent.status}`,
            ip_origen: getClientIp(req)
        });

        res.json({ message: 'Pago sincronizado correctamente', stripe_status: intent.status, pago });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(error.status || 500).json({ message: 'Error al sincronizar pago con Stripe', error: error.message });
    } finally {
        client.release();
    }
};

const reconciliarPagosStripePendientes = async (req, res) => {
    try {
        await ensureStripePagoSchema();
        const pendientes = await pool.query(`
            SELECT id_pago, id_stripe_payment
            FROM pago
            WHERE metodo_pago = 'stripe'
              AND estado = 'pendiente_validacion'
              AND id_stripe_payment IS NOT NULL
            ORDER BY fecha_pago ASC
        `);

        const resumen = { revisados: 0, completados: 0, fallidos: 0, pendientes: 0, errores: [] };

        for (const row of pendientes.rows) {
            resumen.revisados++;
            const client = await pool.connect();
            try {
                const intent = await stripeRequest(`/payment_intents/${row.id_stripe_payment}`);
                await client.query('BEGIN');

                if (intent.status === 'succeeded') {
                    await registrarPagoStripeCompletado(client, intent);
                    resumen.completados++;
                } else if (intent.status === 'requires_payment_method' || intent.status === 'canceled') {
                    await client.query(`
                        UPDATE pago
                        SET estado = 'fallido',
                            stripe_status = $1,
                            stripe_payload = $2::jsonb,
                            observaciones = $3
                        WHERE id_pago = $4
                    `, [
                        intent.status,
                        JSON.stringify(intent),
                        intent.last_payment_error?.message || `Stripe status: ${intent.status}`,
                        row.id_pago,
                    ]);
                    resumen.fallidos++;
                } else {
                    await client.query(`
                        UPDATE pago
                        SET stripe_status = $1,
                            stripe_payload = $2::jsonb
                        WHERE id_pago = $3
                    `, [intent.status, JSON.stringify(intent), row.id_pago]);
                    resumen.pendientes++;
                }

                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                resumen.errores.push({ id_pago: row.id_pago, error: error.message });
            } finally {
                client.release();
            }
        }

        await registrarBitacora({
            id_usuario: req.usuario?.id || null,
            nombre_modulo: 'pagos',
            nombre_permiso: 'gestionar_pagos',
            metodo: 'POST /api/pagos/stripe/reconciliar',
            accion: 'SISTEMA',
            tabla_afectada: 'pago',
            descripcion: `Reconciliación Stripe: ${JSON.stringify(resumen)}`,
            ip_origen: getClientIp(req)
        });

        res.json({ message: 'Reconciliación ejecutada correctamente', resumen });
    } catch (error) {
        res.status(error.status || 500).json({ message: 'Error al reconciliar pagos pendientes', error: error.message });
    }
};

const stripeWebhook = async (req, res) => {
    if (!verificarFirmaStripe(req)) {
        return res.status(400).json({ message: 'Firma de Stripe inválida' });
    }

    const event = req.body;
    const client = await pool.connect();

    try {
        await ensureStripePagoSchema(client);
        const type = event.type;
        const intent = event.data?.object;

        if (!intent?.id) {
            return res.status(400).json({ message: 'Evento Stripe inválido' });
        }

        await client.query('BEGIN');
        if (type === 'payment_intent.succeeded') {
            await registrarPagoStripeCompletado(client, intent);
        } else if (type === 'payment_intent.payment_failed') {
            await client.query(`
                UPDATE pago
                SET estado = 'fallido',
                    stripe_status = $1,
                    stripe_payload = $2::jsonb,
                    observaciones = $3
                WHERE id_stripe_payment = $4
            `, [
                intent.status || 'payment_failed',
                JSON.stringify(intent),
                intent.last_payment_error?.message || 'Pago rechazado por Stripe',
                intent.id,
            ]);
        }
        await client.query('COMMIT');

        await registrarBitacora({
            id_usuario: Number(intent.metadata?.id_usuario || 1),
            nombre_modulo: 'pagos',
            nombre_permiso: 'gestionar_pagos',
            metodo: 'POST /api/pagos/stripe/webhook',
            accion: type === 'payment_intent.succeeded' ? 'UPDATE' : 'SISTEMA',
            tabla_afectada: 'pago',
            descripcion: `Webhook Stripe ${type} para ${intent.id}`,
            ip_origen: getClientIp(req)
        });

        res.json({ received: true });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Error procesando webhook de Stripe', error: error.message });
    } finally {
        client.release();
    }
};

const validarPago = async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body;

    if (!['validado', 'rechazado', 'pendiente_validacion', 'completado', 'fallido'].includes(estado)) {
        return res.status(400).json({ message: 'Estado de pago invalido' });
    }

    try {
        const result = await pool.query(
            'UPDATE pago SET estado = $1 WHERE id_pago = $2 RETURNING *',
            [estado, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Pago no encontrado' });
        }

        res.json({ message: 'Pago actualizado correctamente', pago: result.rows[0] });
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar pago', error: error.message });
    }
};

module.exports = {
    getConceptos,
    createConcepto,
    getDeudas,
    getMisPagos,
    createDeuda,
    getContextoGeneracionDeudas,
    generarDeudasMensuales,
    crearPaymentIntent,
    registrarPago,
    getPagosRegistrados,
    sincronizarPagoStripe,
    reconciliarPagosStripePendientes,
    stripeWebhook,
    validarPago
};
