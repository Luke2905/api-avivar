import pool from './src/config/database';

async function run() {
    try {
        console.log("Criando tabela DADOS_FINANCEIROS_MENSAL...");
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS DADOS_FINANCEIROS_MENSAL (
                ID_DADO INT AUTO_INCREMENT PRIMARY KEY,
                MES INT NOT NULL,
                ANO INT NOT NULL,
                META_FATURAMENTO DECIMAL(10,2) DEFAULT 0,
                INVESTIMENTO_ADS DECIMAL(10,2) DEFAULT 0,
                NOVAS_MAQUINAS DECIMAL(10,2) DEFAULT 0,
                CUSTO_NAO_PRODUTIVO DECIMAL(10,2) DEFAULT 0,
                UNIQUE KEY uk_mes_ano (MES, ANO)
            );
        `);
        console.log("Tabela DADOS_FINANCEIROS_MENSAL criada com sucesso.");
        
        process.exit(0);
    } catch (error) {
        console.error("Erro fatal:", error);
        process.exit(1);
    }
}

run();
