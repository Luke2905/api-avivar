import pool from './src/config/database';

async function run() {
    try {
        console.log("Criando tabela CONFIGURACAO_SHOPEE...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS CONFIGURACAO_SHOPEE (
                ID INT PRIMARY KEY DEFAULT 1,
                PARTNER_ID VARCHAR(50),
                PARTNER_KEY TEXT,
                SHOP_ID VARCHAR(50),
                ACCESS_TOKEN TEXT,
                REFRESH_TOKEN TEXT,
                TOKEN_EXPIRE_IN INT,
                SHOPEE_HOST VARCHAR(200) DEFAULT 'https://partner.shopeemobile.com',
                REDIRECT_URL VARCHAR(200),
                INTEGRACAO_ATIVA TINYINT(1) DEFAULT 0,
                ULTIMA_SINCRONIZACAO DATETIME NULL,
                UPDATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );
        `);
        // Garante que sempre tem 1 linha de config
        await pool.query(`
            INSERT IGNORE INTO CONFIGURACAO_SHOPEE (ID) VALUES (1);
        `);
        console.log("Tabela CONFIGURACAO_SHOPEE criada com sucesso!");
        process.exit(0);
    } catch (error) {
        console.error("Erro:", error);
        process.exit(1);
    }
}
run();
