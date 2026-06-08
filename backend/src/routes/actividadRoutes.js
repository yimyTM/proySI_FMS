const express = require('express');
const router = express.Router();
const {
    getContexto,
    listarActividades,
    crearActividad,
} = require('../controllers/actividadController');
const { verificarToken } = require('../middlewares/authMiddleware');

router.use(verificarToken);

router.get('/contexto', getContexto);
router.get('/', listarActividades);
router.post('/', crearActividad);

module.exports = router;
