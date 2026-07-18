require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        port: Number(process.env.DB_PORT) || 4000,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const [rows] = await pool.query('SHOW INDEXES FROM PEDIDO');
        console.log('Índices da tabela PEDIDO:');
        console.table(rows.map(r => ({ Name: r.Key_name, Column: r.Column_name, Unique: r.Non_unique === 0 })));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
run();
