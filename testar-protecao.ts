// testar-protecao.ts
async function testeDeSeguranca() {
    const urlLogin = 'http://localhost:3000/api/auth/login';
    const urlProduto = 'http://localhost:3000/api/produtos';

    console.log('--- 🕵️ TESTE DE SEGURANÇA ---');

    // 1. Tentar acessar SEM token (Deve falhar)
    console.log('\n1. Tentando acessar produtos SEM token...');
    const tentativa1 = await fetch(urlProduto);
    if (tentativa1.status === 401) {
        console.log('✅ SUCESSO: O sistema barrou o acesso sem token!');
    } else {
        console.log('❌ FALHA: O sistema deixou passar sem token!');
    }

    // 2. Fazer Login para pegar o token
    console.log('\n2. Fazendo login para pegar o crachá...');
    const respLogin = await fetch(urlLogin, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@avivar.com.br', senha: 'senha_super_secreta_123' })
    });
    const dadosLogin = await respLogin.json();
    const token = dadosLogin.token;

    // 3. Tentar acessar COM token (Deve funcionar)
    console.log('\n3. Tentando acessar produtos COM token...');
    const tentativa2 = await fetch(urlProduto, {
        headers: { 'Authorization': `Bearer ${token}` } // <--- Aqui vai o crachá
    });

    if (tentativa2.status === 200) {
        console.log('✅ SUCESSO: Acesso liberado com token válido!');
        const produtos = await tentativa2.json();
        console.log(`   -> Foram encontrados ${produtos.length} produtos.`);
    } else {
        console.log('❌ FALHA: O token válido foi rejeitado:', tentativa2.status);
    }
}

testeDeSeguranca();