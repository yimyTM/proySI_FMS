require('dotenv').config();
const {
    validarCalificaciones,
    generarLibreta,
    remitirLibreta,
    aprobarLibreta,
    listarLibretas,
    obtenerLibretaPorId
} = require('./src/controllers/libretaController');
const { exportarLibretaPdf } = require('./src/controllers/libretaPdfController');
const pool = require('./src/config/db');
const fs = require('fs');
const path = require('path');

const mockUser = {
    id: 1,
    role: 1,
    username: 'admin'
};

const makeMockReq = (custom = {}) => {
    return {
        body: {},
        query: {},
        params: {},
        usuario: mockUser,
        headers: {},
        connection: { remoteAddress: '127.0.0.1' },
        ...custom
    };
};

const { Writable } = require('stream');

const makeMockRes = () => {
    const writeStream = fs.createWriteStream(path.join(__dirname, 'test_output_libreta.pdf'));
    const res = new Writable({
        write(chunk, encoding, callback) {
            writeStream.write(chunk, encoding, callback);
        },
        final(callback) {
            writeStream.end(callback);
        }
    });
    res.statusCode = 200;
    res.headers = {};
    res.data = null;
    res.ended = false;
    res.status = function (code) {
        this.statusCode = code;
        return this;
    };
    res.json = function (data) {
        this.data = data;
        this.ended = true;
        return this;
    };
    res.setHeader = function (name, val) {
        this.headers[name] = val;
    };
    return res;
};


async function runTests() {
    console.log('🚀 Iniciando pruebas de integración de Libretas (CU20)...');

    try {
        await pool.query(
            "DELETE FROM libreta_emitida WHERE id_estudiante = 15 AND trimestre = 2"
        );
        console.log(' Base de datos limpiada para la prueba (Estudiante 15, Trimestre 2).');
    } catch (e) {
        console.error(' Error al limpiar base de datos:', e.message);
    }

    console.log('\n--- 2. Validando calificaciones para Trimestre 2 ---');
    const valReq = makeMockReq({
        query: { id_estudiante: 15, id_curso: 9, id_gestion: 1, trimestre: 2 }
    });
    const valRes = makeMockRes();
    await validarCalificaciones(valReq, valRes);
    console.log('Resultado validación:', valRes.data);

    if (valRes.data && !valRes.data.valido) {
        console.log('Calificaciones incompletas detectadas. Insertando datos de prueba...');
        try {
            const id_estudiante = 15;
            const id_curso = 9;
            const id_gestion = 1;
            const trimestre = 2;

            const materias = await pool.query(
                "SELECT cm.id_curso_materia, m.id_materia FROM curso_materia cm JOIN materia m ON cm.id_materia = m.id_materia WHERE cm.id_curso = $1 AND m.estado = true",
                [id_curso]
            );
            const dims = await pool.query(
                "SELECT id_dimension_eval, nombre_dimension, puntaje_maximo FROM dimension_evaluacion WHERE id_gestion = $1",
                [id_gestion]
            );

            for (const mat of materias.rows) {
                for (const dim of dims.rows) {
                    let acts = await pool.query(
                        "SELECT id_actividad FROM actividad_evaluacion WHERE id_curso_materia = $1 AND id_dimension_eval = $2 AND trimestre = $3 LIMIT 1",
                        [mat.id_curso_materia, dim.id_dimension_eval, trimestre]
                    );
                    let id_actividad;
                    if (acts.rows.length === 0) {
                        const actIns = await pool.query(
                            "INSERT INTO actividad_evaluacion (id_curso_materia, id_dimension_eval, trimestre, nombre_actividad, fecha_actividad) VALUES ($1, $2, $3, $4, CURRENT_DATE) RETURNING id_actividad",
                            [mat.id_curso_materia, dim.id_dimension_eval, trimestre, 'Actividad Prueba T2']
                        );
                        id_actividad = actIns.rows[0].id_actividad;
                    } else {
                        id_actividad = acts.rows[0].id_actividad;
                    }

                    const cCheck = await pool.query(
                        "SELECT 1 FROM calificacion WHERE id_actividad = $1 AND id_estudiante = $2",
                        [id_actividad, id_estudiante]
                    );
                    if (cCheck.rows.length === 0) {
                        const noteVal = Math.floor(parseFloat(dim.puntaje_maximo) * 0.85); // 85% of max score
                        await pool.query(
                            "INSERT INTO calificacion (id_actividad, id_estudiante, nota, fecha_evaluacion) VALUES ($1, $2, $3, CURRENT_DATE)",
                            [id_actividad, id_estudiante, noteVal]
                        );
                    }
                }
            }
            console.log('Datos de calificaciones insertados con éxito.');

            const valRes2 = makeMockRes();
            await validarCalificaciones(valReq, valRes2);
            console.log('Resultado re-validación:', valRes2.data);
        } catch (err) {
            console.error(' Fallo al insertar datos de prueba:', err.message);
        }
    }

    console.log('\n--- 3. Generando libreta ---');
    const genReq = makeMockReq({
        body: { id_estudiante: 15, id_curso: 9, id_gestion: 1, trimestre: 2 }
    });
    const genRes = makeMockRes();
    await generarLibreta(genReq, genRes);
    console.log('Resultado generación:', genRes.data);

    if (genRes.statusCode !== 201) {
        console.error('Error al generar la libreta. Cancelando pruebas.');
        process.exit(1);
    }
    const idLibreta = genRes.data.id_libreta;

    console.log('\n--- 4. Intentando duplicar la libreta (E2) ---');
    const dupRes = makeMockRes();
    await generarLibreta(genReq, dupRes);
    console.log('Status code duplicado (debe ser 409):', dupRes.statusCode);
    console.log('Resultado duplicado:', dupRes.data);

    console.log('\n--- 5. Remitiendo libreta por el profesor ---');
    const remReq = makeMockReq({
        params: { id: idLibreta },
        body: { observacion: 'El estudiante tuvo un excelente desempeño académico en el trimestre.' }
    });
    const remRes = makeMockRes();
    await remitirLibreta(remReq, remRes);
    console.log('Resultado remisión:', remRes.data);

    console.log('\n--- 6. Aprobando libreta por el director ---');
    const aprReq = makeMockReq({
        params: { id: idLibreta }
    });
    const aprRes = makeMockRes();
    await aprobarLibreta(aprReq, aprRes);
    console.log('Resultado aprobación:', aprRes.data);

    console.log('\n--- 7. Intentando aprobar libreta ya aprobada (E3) ---');
    const aprDupRes = makeMockRes();
    await aprobarLibreta(aprReq, aprDupRes);
    console.log('Status code doble aprobación (debe ser 409):', aprDupRes.statusCode);
    console.log('Resultado doble aprobación:', aprDupRes.data);

    console.log('\n--- 8. Obteniendo detalle de libreta ---');
    const detReq = makeMockReq({
        params: { id: idLibreta }
    });
    const detRes = makeMockRes();
    await obtenerLibretaPorId(detReq, detRes);
    console.log('Cabecera:', detRes.data.cabecera);
    console.log('Primeros 2 detalles:', detRes.data.detalles.slice(0, 2));

    console.log('\n--- 9. Exportando a PDF ---');
    const pdfReq = makeMockReq({
        params: { id: idLibreta }
    });
    const pdfRes = makeMockRes();
    await exportarLibretaPdf(pdfReq, pdfRes);

    setTimeout(() => {
        const filePath = path.join(__dirname, 'test_output_libreta.pdf');
        if (fs.existsSync(filePath)) {
            console.log(`\n🎉 ¡Pruebas completadas con éxito! Archivo de prueba generado en: ${filePath}`);
        } else {
            console.error('\n❌ No se pudo encontrar el archivo PDF de salida de la prueba.');
        }
        process.exit(0);
    }, 1500);
}

runTests();
