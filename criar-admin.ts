// criar-admin.ts
async function criarAdmin() {
    const url = 'http://localhost:3000/api/usuarios/registro';
    
    const admin = {
        nome: 'Administrador',
        email: 'admin@avivar.com.br',
        senha: 'senha_super_secreta_123', // Isso vai virar hash no banco!
        perfil: 'ADMIN' //  Perfil de Administrador
    };

    console.log('🔐 Criando Administrador...');

    try {
        const resposta = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(admin)
        });

        const dados = await resposta.json();
        console.log('Resposta:', dados);
    } catch (erro) {
        console.error('Erro:', erro);
    }
}

criarAdmin();