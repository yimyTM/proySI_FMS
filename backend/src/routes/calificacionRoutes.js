const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/authMiddleware');
const {
    listarCalificacionesActividad,
    guardarCalificacionesActividad,
} = require('../controllers/calificacionController');

router.use(verificarToken);

router.get('/actividad/:id_actividad', listarCalificacionesActividad);
router.post('/actividad/:id_actividad', guardarCalificacionesActividad);

module.exports = router;
