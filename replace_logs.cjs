const fs = require('fs');
const pathModule = require('path');

const basePath = 'C:/Workspace/React/avivar-api';

// --- AUTH CONTROLLER ---
const authPath = pathModule.join(basePath, 'src/controllers/authController.ts');
let auth = fs.readFileSync(authPath, 'utf8');
if (!auth.includes('registrarLog')) {
    auth = auth.replace(
        /import bcrypt from 'bcryptjs';/,
        `import bcrypt from 'bcryptjs';\nimport { registrarLog } from '../services/logService';`
    );
    auth = auth.replace(
        /res\.json\(\{ token, usuario: payload \}\);/,
        `await registrarLog(usuario.NOME, 'LOGIN', \`Usuário realizou login com sucesso.\`);\n        res.json({ token, usuario: payload });`
    );
    fs.writeFileSync(authPath, auth);
    console.log('Logs added to authController');
}

// --- PEDIDO CONTROLLER ---
const pedidoPath = pathModule.join(basePath, 'src/controllers/pedidoController.ts');
let pedido = fs.readFileSync(pedidoPath, 'utf8');
if (!pedido.includes('registrarLog')) {
    pedido = pedido.replace(
        /import pool from '\.\.\/config\/database';/,
        `import pool from '../config/database';\nimport { registrarLog } from '../services/logService';`
    );
    pedido = pedido.replace(
        /res\.status\(201\)\.json\(\{ mensagem: 'Pedido e itens criados com sucesso!' \}\);/,
        `await registrarLog('SISTEMA', 'CRIAR_PEDIDO', \`Pedido \${num_pedido} criado para \${nome_cliente}.\`);\n        res.status(201).json({ mensagem: 'Pedido e itens criados com sucesso!' });`
    );
    pedido = pedido.replace(
        /res\.json\(\{ mensagem: 'Status atualizado!' \}\);/,
        `await registrarLog('SISTEMA', 'ATUALIZAR_STATUS', \`Status do pedido \${id} alterado para \${novo_status}.\`);\n        res.json({ mensagem: 'Status atualizado!' });`
    );
    pedido = pedido.replace(
        /res\.json\(\{ mensagem: 'Pedido excluído com sucesso\.' \}\);/,
        `await registrarLog('SISTEMA', 'EXCLUIR_PEDIDO', \`Pedido \${id} excluído.\`);\n        res.json({ mensagem: 'Pedido excluído com sucesso.' });`
    );
    pedido = pedido.replace(
        /res\.json\(\{ mensagem: 'Pedido atualizado com sucesso!' \}\);/,
        `await registrarLog('SISTEMA', 'ATUALIZAR_PEDIDO', \`Pedido \${id} atualizado.\`);\n        res.json({ mensagem: 'Pedido atualizado com sucesso!' });`
    );
    fs.writeFileSync(pedidoPath, pedido);
    console.log('Logs added to pedidoController');
}

// --- DRE CONTROLLER ---
const drePath = pathModule.join(basePath, 'src/controllers/dreController.ts');
let dre = fs.readFileSync(drePath, 'utf8');
if (!dre.includes('registrarLog')) {
    dre = dre.replace(
        /import pool from '\.\.\/config\/database';/,
        `import pool from '../config/database';\nimport { registrarLog } from '../services/logService';`
    );
    dre = dre.replace(
        /res\.json\(\{ mensagem: "Dados mensais salvos com sucesso!" \}\);/,
        `await registrarLog('SISTEMA', 'ATUALIZAR_METAS_FINANCEIRAS', \`Metas e Custos do mês \${mes}/\${ano} atualizados.\`);\n        res.json({ mensagem: "Dados mensais salvos com sucesso!" });`
    );
    fs.writeFileSync(drePath, dre);
    console.log('Logs added to dreController');
}
