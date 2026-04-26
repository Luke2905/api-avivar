import pool from './src/config/database';

async function run() {
    try {
        console.log("Adicionando colunas na tabela PEDIDO...");
        
        // Use IF NOT EXISTS equivalent logic or just ignore error if column exists
        try {
            await pool.query('ALTER TABLE PEDIDO ADD COLUMN PRAZO_ENVIO DATE;');
            console.log("Coluna PRAZO_ENVIO adicionada.");
        } catch (e: any) {
            console.log("Aviso (PRAZO_ENVIO):", e.message);
        }

        try {
            await pool.query('ALTER TABLE PEDIDO ADD COLUMN LINK_ARTE VARCHAR(255);');
            console.log("Coluna LINK_ARTE adicionada.");
        } catch (e: any) {
            console.log("Aviso (LINK_ARTE):", e.message);
        }

        console.log("Feito!");
        process.exit(0);
    } catch (error) {
        console.error("Erro fatal:", error);
        process.exit(1);
    }
}

run();
