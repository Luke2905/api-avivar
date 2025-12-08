// criar-pedidos-teste.ts
// Script para popular o Kanban com dados fake
import axios from 'axios';

async function popularBanco() {
    // 1. Primeiro fazemos login para pegar o Token
    const login = await axios.post('http://localhost:3000/api/auth/login', {
        email: 'admin@avivar.com.br',
        senha: 'senha_super_secreta_123'
    });
    
    const token = login.data.token;
    const config = { headers: { Authorization: `Bearer ${token}` } };
    const url = 'http://localhost:3000/api/pedidos';

    console.log('🚀 Criando pedidos de teste...');

    const pedidosFakes = [
        { nome_cliente: 'Maria Silva', num_pedido: 'SHOPEE-991', valor: 150.00, status: 'ENTRADA' },
        { nome_cliente: 'João Souza', num_pedido: 'SITE-002', valor: 89.90, status: 'AGUARDANDO_ARTE' },
        { nome_cliente: 'Empresa X', num_pedido: 'ZAP-554', valor: 1200.00, status: 'PRODUCAO' },
        { nome_cliente: 'Ana Paula', num_pedido: 'ML-112', valor: 45.00, status: 'ENVIADO' },
    ];

    for (const p of pedidosFakes) {
        await axios.post(url, p, config);
        console.log(`✅ Pedido de ${p.nome_cliente} (${p.status}) criado.`);
    }
}

popularBanco().catch(console.error);