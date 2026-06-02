const express = require('express');
const router = express.Router();
const { getEstudiantes, createEstudiante, updateEstudiante, exportarEstudiantesCsv } = require('../controllers/estudianteController');
const { verificarToken, esAdminDirectorOSecretaria } = require('../middlewares/authMiddleware');

router.get('/exportar/csv', verificarToken, esAdminDirectorOSecretaria, exportarEstudiantesCsv);

router.get('/', verificarToken, getEstudiantes);
router.post('/', verificarToken, esAdminDirectorOSecretaria, createEstudiante);
router.put('/:id', verificarToken, esAdminDirectorOSecretaria, updateEstudiante);

module.exports = router;
