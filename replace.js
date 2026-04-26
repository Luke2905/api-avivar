const fs = require('fs');

const path = 'C:/Workspace/React/avivar-api/src/controllers/pedidoController.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
    'const { nome_cliente, num_pedido, plataforma, itens } = req.body;',
    'const { nome_cliente, num_pedido, plataforma, itens, prazo_envio, link_arte } = req.body;'
);

content = content.replace(
    `INSERT INTO PEDIDO (NOME_CLIENTE, NUM_PEDIDO_PLATAFORMA, PLATAFORMA_ORIGEM, VALOR_TOTAL, DATA_PEDIDO, STATUS_PEDIDO)
            VALUES (?, ?, ?, ?, NOW(), 'ENTRADA')`,
    `INSERT INTO PEDIDO (NOME_CLIENTE, NUM_PEDIDO_PLATAFORMA, PLATAFORMA_ORIGEM, VALOR_TOTAL, DATA_PEDIDO, STATUS_PEDIDO, PRAZO_ENVIO, LINK_ARTE)
            VALUES (?, ?, ?, ?, NOW(), 'ENTRADA', ?, ?)`
);

content = content.replace(
    `[nome_cliente, num_pedido, plataforma, total]);`,
    `[nome_cliente, num_pedido, plataforma, total, prazo_envio || null, link_arte || null]);`
);

content = content.replace(
    'const { nome_cliente, num_pedido, plataforma, valor_total, itens } = req.body;',
    'const { nome_cliente, num_pedido, plataforma, valor_total, itens, prazo_envio, link_arte } = req.body;'
);

content = content.replace(
    `UPDATE PEDIDO 
            SET NOME_CLIENTE = ?, 
                NUM_PEDIDO_PLATAFORMA = ?, 
                PLATAFORMA_ORIGEM = ?, 
                VALOR_TOTAL = ?
            WHERE ID_PEDIDO = ?`,
    `UPDATE PEDIDO 
            SET NOME_CLIENTE = ?, 
                NUM_PEDIDO_PLATAFORMA = ?, 
                PLATAFORMA_ORIGEM = ?, 
                VALOR_TOTAL = ?,
                PRAZO_ENVIO = ?,
                LINK_ARTE = ?
            WHERE ID_PEDIDO = ?`
);

content = content.replace(
    `[nome_cliente, num_pedido, plataforma, valor_total, id]);`,
    `[nome_cliente, num_pedido, plataforma, valor_total, prazo_envio || null, link_arte || null, id]);`
);

fs.writeFileSync(path, content);
console.log('Done replacing in pedidoController.ts');
