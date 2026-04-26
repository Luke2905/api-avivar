import pool from './src/config/database';

async function run() {
    try {
        console.log("Criando tabela LOGS_SISTEMA...");
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS LOGS_SISTEMA (
                ID_LOG INT AUTO_INCREMENT PRIMARY KEY,
                NOME_USUARIO VARCHAR(255),
                ACAO VARCHAR(255) NOT NULL,
                DETALHES TEXT,
                DATA_CRIACAO DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Tabela LOGS_SISTEMA criada com sucesso.");
        
        process.exit(0);
    } catch (error) {
        console.error("Erro fatal:", error);
        process.exit(1);
    }
}

run();
