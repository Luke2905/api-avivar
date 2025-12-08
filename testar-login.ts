// testar-login.ts
async function tentarLogar() {
    const url = 'http://localhost:3000/api/auth/login';
    
    const credenciais = {
        email: 'admin@avivar.com.br',
        senha: 'senha_super_secreta_123' // A senha que definimos antes
    };

    console.log('🔑 Tentando entrar no sistema...');

    try {
        const resposta = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credenciais)
        });

        const dados = await resposta.json();
        
        if (dados.token) {
            console.log('✅ SUCESSO! Token recebido:');
            console.log(dados.token); // <--- Esse é o JWT gigante
        } else {
            console.log('❌ Falha:', dados);
        }

    } catch (erro) {
        console.error('Erro:', erro);
    }
}

tentarLogar();