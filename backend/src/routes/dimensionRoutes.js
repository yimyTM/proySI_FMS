const express = require('express');
const router = express.Router();
const {
    getContexto,
    obtenerEstructura,
    guardarConfiguracion,
} = require('../controllers/dimensionController');
const { verificarToken } = require('../middlewares/authMiddleware');

router.use(verificarToken);

router.get('/contexto', getContexto);
router.get('/', obtenerEstructura);
router.post('/configuracion', guardarConfiguracion);

module.exports = router;
