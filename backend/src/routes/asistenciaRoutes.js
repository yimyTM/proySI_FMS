const express = require('express');
const router = express.Router();
const {
    getCursosAsistencia,
    getAsistenciaCurso,
    registrarAsistencia,
    consultarAsistenciaAnterior
} = require('../controllers/asistenciaController');
const { verificarToken } = require('../middlewares/authMiddleware');
const { requierePermiso } = require('../middlewares/permissionMiddleware');

router.get('/cursos', verificarToken, requierePermiso('ver_asistencias'), getCursosAsistencia);
router.get('/curso/:id_curso/historial', verificarToken, requierePermiso('ver_asistencias'), consultarAsistenciaAnterior);
router.get('/curso/:id_curso', verificarToken, requierePermiso('ver_asistencias'), getAsistenciaCurso);
router.post('/curso/:id_curso', verificarToken, requierePermiso('registrar_asistencia'), registrarAsistencia);

module.exports = router;
