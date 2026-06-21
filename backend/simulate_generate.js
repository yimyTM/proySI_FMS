const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'fms_db',
    password: process.env.DB_PASSWORD || 'postgres',
    port: Number(process.env.DB_PORT) || 5432,
});

async function run() {
    try {
        const id_estudiante = 15; // Roshely
        const id_curso = 9;
        const id_gestion = 1;
        const trimestre = 2;

        const prevLibretas = await pool.query(`
            SELECT id_libreta, trimestre, estado FROM libreta_emitida 
            WHERE id_estudiante = $1 AND id_curso = $2 AND id_gestion = $3 AND estado IN ('APROBADA', 'entregada')
        `, [id_estudiante, id_curso, id_gestion]);
        console.log("prevLibretas rows:", prevLibretas.rows);

        const prevGrades = {};
        for (const prev of prevLibretas.rows) {
            const prevDets = await pool.query(`
                SELECT id_materia, nota_primer_trimestre, nota_segundo_trimestre, nota_tercer_trimestre 
                FROM libreta_detalle 
                WHERE id_libreta = $1
            `, [prev.id_libreta]);
            console.log(`Dets for prev libreta ${prev.id_libreta} (T${prev.trimestre}):`, prevDets.rows);
            for (const det of prevDets.rows) {
                if (!prevGrades[det.id_materia]) {
                    prevGrades[det.id_materia] = {};
                }
                if (prev.trimestre === 1) {
                    prevGrades[det.id_materia].t1 = parseFloat(det.nota_primer_trimestre);
                }
                if (prev.trimestre === 2) {
                    prevGrades[det.id_materia].t2 = parseFloat(det.nota_segundo_trimestre);
                }
            }
        }
        console.log("Compiled prevGrades:", prevGrades);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
