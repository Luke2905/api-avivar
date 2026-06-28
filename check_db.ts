import pool from './src/config/database';

async function check() {
    try {
        const [prod] = await pool.query('DESCRIBE PRODUTO');
        console.log('PRODUTO:', prod);
        
        const [mat] = await pool.query('DESCRIBE MATERIA_PRIMA');
        console.log('MATERIA_PRIMA:', mat);
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
check();
