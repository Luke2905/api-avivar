// testar-produto.ts
// Esse script finge ser o Front-end enviando dados
async function criarProdutoTeste() {
    const url = 'http://localhost:3000/api/produtos';
    
    const novoProduto = {
        sku: `TESTE-${Math.floor(Math.random() * 1000)}`, // Gera um SKU aleatório
        nome: 'Camiseta Avivar Rosa',
        preco: 49.90,
        id_categoria: 1 // Usando a categoria 'Canecas' que já existe (ou crie outra se quiser)
    };

    console.log('📤 Enviando produto:', novoProduto);

    try {
        const resposta = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(novoProduto)
        });

        const dados = await resposta.json();
        console.log('✅ Resposta do Servidor:', dados);
    } catch (erro) {
        console.error('❌ Erro:', erro);
    }
}

criarProdutoTeste();