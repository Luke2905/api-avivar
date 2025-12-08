import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Carrega as variáveis do arquivo .env
dotenv.config();

// Cria a conexão (Pool de conexões é mais eficiente que uma única conexão)
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    // ⚠️ Correção importante: O TypeScript exige que a porta seja NUMBER.
    // O .env retorna string, então convertemos com Number()
    port: Number(process.env.DB_PORT) || 4000,
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true // Obrigatório para o TiDB Cloud
    },
    waitForConnections: true,
    connectionLimit: 10, // Mantém até 10 conexões abertas prontas pra uso
    queueLimit: 0
});

// Função auxiliar para testar se deu certo a conexão
export async function testarConexao() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Conexão com TiDB/MySQL estabelecida com sucesso!');
        connection.release(); // Devolve a conexão pro pool para não travar
    } catch (error) {
        console.error('❌ Erro ao conectar no Banco de Dados:', error);
    }
}

export default pool;