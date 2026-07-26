import pool from './src/config/database';

async function checkSchema() {
    try {
        const [materia]: any = await pool.query("DESCRIBE MATERIA_PRIMA");
        console.log('MATERIA_PRIMA:', materia);
        const [movimento]: any = await pool.query("DESCRIBE MOVIMENTO_ESTOQUE");
        console.log('MOVIMENTO_ESTOQUE:', movimento);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
checkSchema();
