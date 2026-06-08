const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/pagoController');
const { verificarToken } = require('../middlewares/authMiddleware');
const { requierePermiso } = require('../middlewares/permissionMiddleware');

router.get('/conceptos', verificarToken, requierePermiso('ver_pagos'), getConceptos);
router.post('/conceptos', verificarToken, requierePermiso('gestionar_pagos'), createConcepto);
router.get('/deudas', verificarToken, requierePermiso('ver_pagos'), getDeudas);
router.get('/deudas/generar/contexto', verificarToken, requierePermiso('ver_pagos'), getContextoGeneracionDeudas);
router.post('/deudas/generar-mensual', verificarToken, requierePermiso('gestionar_pagos'), generarDeudasMensuales);
router.post('/deudas', verificarToken, requierePermiso('gestionar_pagos'), createDeuda);
router.get('/mis-pagos', verificarToken, getMisPagos);
router.post('/stripe/payment-intent', verificarToken, crearPaymentIntent);
router.post('/stripe/webhook', stripeWebhook);
router.get('/registrados', verificarToken, requierePermiso('ver_pagos'), getPagosRegistrados);
router.post('/stripe/sincronizar', verificarToken, requierePermiso('gestionar_pagos'), sincronizarPagoStripe);
router.post('/stripe/reconciliar', verificarToken, requierePermiso('gestionar_pagos'), reconciliarPagosStripePendientes);
router.post('/', verificarToken, requierePermiso('gestionar_pagos'), registrarPago);
router.put('/:id/estado', verificarToken, requierePermiso('gestionar_pagos'), validarPago);

module.exports = router;
