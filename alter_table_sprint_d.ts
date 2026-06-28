import pool from './src/config/database';

async function run() {
    try {
        console.log("Adicionando coluna OBSERVACOES na tabela PEDIDO...");
        
        try {
            await pool.query('ALTER TABLE PEDIDO ADD COLUMN OBSERVACOES TEXT;');
            console.log("Coluna OBSERVACOES adicionada.");
        } catch (e: any) {
            console.log("Aviso (OBSERVACOES):", e.message);
        }

        console.log("Feito!");
        process.exit(0);
    } catch (error) {
        console.error("Erro fatal:", error);
        process.exit(1);
    }
}

run();
