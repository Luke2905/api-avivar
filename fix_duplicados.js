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
        console.log('Encontrando duplicados...');
        const [duplicados] = await pool.query(`
            SELECT NUM_PEDIDO_PLATAFORMA, COUNT(*) as qtd
            FROM PEDIDO
            WHERE PLATAFORMA_ORIGEM = 'Shopee'
            GROUP BY NUM_PEDIDO_PLATAFORMA
            HAVING qtd > 1
        `);
        
        console.log(`Encontrados ${duplicados.length} pedidos duplicados.`);
        
        for (const row of duplicados) {
            const num = row.NUM_PEDIDO_PLATAFORMA;
            // Get all IDs for this duplicated order
            const [ids] = await pool.query(`
                SELECT ID_PEDIDO FROM PEDIDO 
                WHERE PLATAFORMA_ORIGEM = 'Shopee' AND NUM_PEDIDO_PLATAFORMA = ?
                ORDER BY ID_PEDIDO ASC
            `, [num]);
            
            // Keep the first one, delete the rest
            const toKeep = ids[0].ID_PEDIDO;
            const toDelete = ids.slice(1).map(idRow => idRow.ID_PEDIDO);
            
            console.log(`Pedido ${num}: Mantendo ID ${toKeep}, Deletando IDs ${toDelete.join(', ')}`);
            
            if (toDelete.length > 0) {
                const placeholders = toDelete.map(() => '?').join(',');
                await pool.query(`DELETE FROM ITEM_PEDIDO WHERE ID_PEDIDO IN (${placeholders})`, toDelete);
                await pool.query(`DELETE FROM PEDIDO WHERE ID_PEDIDO IN (${placeholders})`, toDelete);
            }
        }
        
        console.log('Criando constraint UNIQUE na tabela PEDIDO (PLATAFORMA_ORIGEM, NUM_PEDIDO_PLATAFORMA)...');
        await pool.query('ALTER TABLE PEDIDO ADD UNIQUE INDEX uk_pedido_plataforma (PLATAFORMA_ORIGEM, NUM_PEDIDO_PLATAFORMA)');
        console.log('Constraint criada com sucesso! Duplicação a nível de banco de dados resolvida.');

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
run();
