const express = require('express');
const router = express.Router();
const {
    listarInasistencias,
    buscarInasistencia,
    registrarJustificacion,
    listarPendientes,
    listarJustificaciones,
    resolverJustificacion
} = require('../controllers/justificacionController');
const { verificarToken } = require('../middlewares/authMiddleware');

router.use(verificarToken);

router.get('/inasistencias', listarInasistencias);
router.get('/buscar-inasistencia', buscarInasistencia);
router.get('/pendientes', listarPendientes);
router.get('/', listarJustificaciones);
router.post('/', registrarJustificacion);
router.put('/:id/resolver', resolverJustificacion);

module.exports = router;
