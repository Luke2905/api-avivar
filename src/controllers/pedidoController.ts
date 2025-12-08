// src/controllers/pedidoController.ts
import { Request, Response } from 'express';
import pool from '../config/database';

// GET: Listar pedidos (Agora trazendo um resumo dos itens na listagem principal)
export const listarPedidos = async (req: Request, res: Response) => {
    try {
        // Usamos GROUP_CONCAT para criar uma string resumo: "2x Caneca, 1x Camiseta"
        // Isso permite mostrar o que tem no pedido sem precisar abrir o detalhe
        const query = `
            SELECT 
                p.*,
                (
                    SELECT GROUP_CONCAT(CONCAT(ip.QUANTIDADE, 'x ', pr.NOME_PRODUTO) SEPARATOR ', ')
                    FROM ITEM_PEDIDO ip
                    JOIN PRODUTO pr ON ip.ID_PRODUTO = pr.ID_PRODUTO
                    WHERE ip.ID_PEDIDO = p.ID_PEDIDO
                ) as resumo_itens
            FROM PEDIDO p 
            ORDER BY p.DATA_PEDIDO DESC
        `;
        const [rows] = await pool.query(query);
        res.json(rows);
    } catch (error) {
        console.error('Erro ao listar:', error);
        res.status(500).json({ mensagem: 'Erro ao carregar pedidos' });
    }
};

// GET: Detalhes de UM pedido específico (Para o Modal de Detalhes)
export const obterDetalhesPedido = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        // 1. Dados do Pedido
        const [pedidos]: any = await pool.query('SELECT * FROM PEDIDO WHERE ID_PEDIDO = ?', [id]);
        if (pedidos.length === 0) return res.status(404).json({ mensagem: 'Pedido não encontrado' });

        // 2. Dados dos Itens
        const [itens]: any = await pool.query(`
            SELECT 
                ip.*, 
                pr.SKU_PRODUTO, 
                pr.NOME_PRODUTO 
            FROM ITEM_PEDIDO ip
            JOIN PRODUTO pr ON ip.ID_PRODUTO = pr.ID_PRODUTO
            WHERE ip.ID_PEDIDO = ?
        `, [id]);

        res.json({ pedido: pedidos[0], itens });
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao buscar detalhes' });
    }
};

// POST: Criar Pedido COM ITENS (Transação no Banco)
export const criarPedido = async (req: Request, res: Response) => {
    const { nome_cliente, num_pedido, plataforma, itens } = req.body; 
    // 'itens' deve ser um array: [{ id_produto, quantidade, valor_unitario }]

    const connection = await pool.getConnection(); // Pega conexão exclusiva para transação

    try {
        await connection.beginTransaction(); // Inicia a transação (Tudo ou Nada)

        // 1. Calcula o total somando os itens
        const total = itens.reduce((acc: number, item: any) => acc + (item.quantidade * item.valor_unitario), 0);

        // 2. Insere o Pedido (Cabeçalho)
        const [result]: any = await connection.query(`
            INSERT INTO PEDIDO (NOME_CLIENTE, NUM_PEDIDO_PLATAFORMA, PLATAFORMA_ORIGEM, VALOR_TOTAL, DATA_PEDIDO, STATUS_PEDIDO)
            VALUES (?, ?, ?, ?, NOW(), 'ENTRADA')
        `, [nome_cliente, num_pedido, plataforma, total]);

        const novoIdPedido = result.insertId;

        // 3. Insere cada Item
        for (const item of itens) {
            await connection.query(`
                INSERT INTO ITEM_PEDIDO (ID_PEDIDO, ID_PRODUTO, QUANTIDADE, VALOR_UNITARIO)
                VALUES (?, ?, ?, ?)
            `, [novoIdPedido, item.id_produto, item.quantidade, item.valor_unitario]);
        }

        await connection.commit(); // Confirma tudo
        res.status(201).json({ mensagem: 'Pedido e itens criados com sucesso!' });

    } catch (error) {
        await connection.rollback(); // Se der erro, desfaz tudo
        console.error('Erro ao criar pedido completo:', error);
        res.status(500).json({ mensagem: 'Erro ao salvar pedido' });
    } finally {
        connection.release(); // Devolve conexão
    }
};

// PATCH: Atualizar status (já existia, mantenha igual)
export const atualizarStatusPedido = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { novo_status } = req.body;
    try {
        await pool.query('UPDATE PEDIDO SET STATUS_PEDIDO = ? WHERE ID_PEDIDO = ?', [novo_status, id]);
        res.json({ mensagem: 'Status atualizado!' });
    } catch (error) { res.status(500).json({ mensagem: 'Erro' }); }
};

export const importarPedidosLote = async (req: Request, res: Response) => {
    const { pedidos } = req.body;

    if (!pedidos || pedidos.length === 0) {
        return res.status(400).json({ mensagem: 'Nenhum pedido fornecido.' });
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        let pedidosCriados = 0;
        let itensCriados = 0;
        let skusNaoEncontrados: string[] = [];

        // 1. Buscar produtos e criar o Mapa
        const [produtosDb]: any = await connection.query('SELECT ID_PRODUTO, SKU_PRODUTO, PRECO_VENDA FROM PRODUTO');
        
        const mapaProdutos = new Map();
        produtosDb.forEach((p: any) => {
            // Normalização Pesada: Remove espaços e converte p/ maiúsculo
            const skuNormalizado = String(p.SKU_PRODUTO).trim().toUpperCase();
            mapaProdutos.set(skuNormalizado, { id: p.ID_PRODUTO, preco: p.PRECO_VENDA });
        });

        console.log('--- INÍCIO DA IMPORTAÇÃO ---');
        console.log(`SKUs no Banco (${mapaProdutos.size}):`, Array.from(mapaProdutos.keys()));

        // Itera sobre cada pedido
        for (const p of pedidos) {
            // Insere Pedido... (código igual ao anterior)
            const [resPedido]: any = await connection.query(`
                INSERT INTO PEDIDO (NOME_CLIENTE, NUM_PEDIDO_PLATAFORMA, PLATAFORMA_ORIGEM, VALOR_TOTAL, DATA_PEDIDO, STATUS_PEDIDO)
                VALUES (?, ?, ?, ?, ?, 'ENTRADA')
            `, [
                p.nome_cliente || 'Cliente Planilha',
                p.num_pedido || `IMP-${Date.now()}`,
                p.plataforma || 'Excel',
                p.valor_total || 0,
                p.data ? new Date(p.data) : new Date()
            ]);

            const novoIdPedido = resPedido.insertId;
            pedidosCriados++;

            // Processa Itens
            if (p.itens && p.itens.length > 0) {
                for (const item of p.itens) {
                    // Normalização Pesada do que vem do Excel
                    const skuBruto = item.sku;
                    const skuLimpo = String(skuBruto || '').trim().toUpperCase();
                    
                    console.log(`Processando Item: Excel="${skuBruto}" -> Limpo="${skuLimpo}"`);

                    const produtoEncontrado = mapaProdutos.get(skuLimpo);

                    if (produtoEncontrado) {
                        await connection.query(`
                            INSERT INTO ITEM_PEDIDO (ID_PEDIDO, ID_PRODUTO, QUANTIDADE, VALOR_UNITARIO)
                            VALUES (?, ?, ?, ?)
                        `, [
                            novoIdPedido,
                            produtoEncontrado.id,
                            item.qtd || 1,
                            produtoEncontrado.preco
                        ]);
                        itensCriados++;
                        console.log(`✅ Encontrado! ID: ${produtoEncontrado.id}`);
                    } else {
                        console.warn(`❌ SKU NÃO ENCONTRADO: "${skuLimpo}"`);
                        skusNaoEncontrados.push(skuLimpo);
                    }
                }
            }
        }

        await connection.commit();
        
        // Mensagem de resposta mais detalhada
        let msg = `Importação concluída! ${pedidosCriados} pedidos e ${itensCriados} itens processados.`;
        if (skusNaoEncontrados.length > 0) {
            msg += ` ATENÇÃO: ${skusNaoEncontrados.length} itens ignorados por SKU inválido (Ex: ${skusNaoEncontrados[0]}).`;
        }

        res.status(201).json({ mensagem: msg });

    } catch (error) {
        await connection.rollback();
        console.error('Erro:', error);
        res.status(500).json({ mensagem: 'Erro ao processar importação.' });
    } finally {
        connection.release();
    }

    
};

// DELETE: Excluir pedido e seus itens
export const excluirPedido = async (req: Request, res: Response) => {
    const { id } = req.params;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Remove os itens primeiro (Cascade manual por segurança)
        await connection.query('DELETE FROM ITEM_PEDIDO WHERE ID_PEDIDO = ?', [id]);

        // 2. Remove o pedido
        await connection.query('DELETE FROM PEDIDO WHERE ID_PEDIDO = ?', [id]);

        await connection.commit();
        res.json({ mensagem: 'Pedido excluído com sucesso.' });

    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao excluir pedido.' });
    } finally {
        connection.release();
    }
};

// PATCH: Atualizar Número da Nota Fiscal
export const atualizarNotaFiscal = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { numero_nota } = req.body; // Recebe o número (ex: "5055") ou null para limpar

    const connection = await pool.getConnection();

    try {
        // Se mandou um número, salva ele e marca NF_EMITIDA = 1
        // Se mandou vazio/null, limpa o número e marca NF_EMITIDA = 0
        const temNota = numero_nota ? 1 : 0;
        
        await connection.query(
            'UPDATE PEDIDO SET NUM_NOTA_FISCAL = ?, NF_EMITIDA = ? WHERE ID_PEDIDO = ?', 
            [numero_nota, temNota, id]
        );

        res.json({ 
            mensagem: temNota ? 'Nota Fiscal registrada!' : 'Nota Fiscal removida.',
            num_nota: numero_nota
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao salvar NF.' });
    } finally {
        connection.release();
    }
};