const fs = require('fs');

const file = 'src/controllers/pedidoController.ts';
let content = fs.readFileSync(file, 'utf8');

// Fix criarPedido destructuring
content = content.replace(
    'const { nome_cliente, num_pedido, plataforma, itens, prazo_envio, link_arte } = req.body;',
    'const { nome_cliente, num_pedido, plataforma, itens, prazo_envio, link_arte, observacoes } = req.body;'
);

// Fix criarPedido insert
content = content.replace(
    /INSERT INTO PEDIDO \(NOME_CLIENTE, NUM_PEDIDO_PLATAFORMA, PLATAFORMA_ORIGEM, VALOR_TOTAL, DATA_PEDIDO, STATUS_PEDIDO\)\s*VALUES \(\?, \?, \?, \?, NOW\(\), 'ENTRADA'\)/,
    "INSERT INTO PEDIDO (NOME_CLIENTE, NUM_PEDIDO_PLATAFORMA, PLATAFORMA_ORIGEM, VALOR_TOTAL, DATA_PEDIDO, STATUS_PEDIDO, PRAZO_ENVIO, LINK_ARTE, OBSERVACOES)\n            VALUES (?, ?, ?, ?, NOW(), 'ENTRADA', ?, ?, ?)"
);
content = content.replace(
    /\[nome_cliente, num_pedido, plataforma, total, prazo_envio \|\| null, link_arte \|\| null\]\);/g,
    "[nome_cliente, num_pedido, plataforma, total, prazo_envio || null, link_arte || null, observacoes || null]);"
);

// Fix atualizarPedido destructuring
content = content.replace(
    'const { nome_cliente, num_pedido, plataforma, valor_total, itens, prazo_envio, link_arte } = req.body;',
    'const { nome_cliente, num_pedido, plataforma, valor_total, itens, prazo_envio, link_arte, observacoes } = req.body;'
);

// Fix atualizarPedido update
content = content.replace(
    /UPDATE PEDIDO\s*SET NOME_CLIENTE = \?, \s*NUM_PEDIDO_PLATAFORMA = \?, \s*PLATAFORMA_ORIGEM = \?, \s*VALOR_TOTAL = \?\s*WHERE ID_PEDIDO = \?/g,
    `UPDATE PEDIDO 
            SET NOME_CLIENTE = ?, 
                NUM_PEDIDO_PLATAFORMA = ?, 
                PLATAFORMA_ORIGEM = ?, 
                VALOR_TOTAL = ?,
                PRAZO_ENVIO = ?,
                LINK_ARTE = ?,
                OBSERVACOES = ?
            WHERE ID_PEDIDO = ?`
);

content = content.replace(
    /\[nome_cliente, num_pedido, plataforma, valor_total, prazo_envio \|\| null, link_arte \|\| null, id\]/g,
    "[nome_cliente, num_pedido, plataforma, valor_total, prazo_envio || null, link_arte || null, observacoes || null, id]"
);

fs.writeFileSync(file, content, 'utf8');
console.log('Replaced successfully');
