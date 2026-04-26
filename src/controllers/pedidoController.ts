// src/controllers/pedidoController.ts
import { Request, Response } from 'express';
import pool from '../config/database';
import { registrarLog } from '../services/logService';
import { buscarPedidosShopee } from '../services/shopeeService';

function converterDataParaUnixSegundos(valor: string) {
    const timestamp = Math.floor(new Date(valor).getTime() / 1000);
    return Number.isFinite(timestamp) ? timestamp : NaN;
}

// GET: Listar pedidos (Agora trazendo um resumo dos itens na listagem principal)
export const listarPedidos = async (req: Request, res: Response) => {
    try {
        const {
            dia,
            mes,
            ano,
            origem,
            numero,
            status,
            data_inicio,
            data_fim
        } = req.query as Record<string, string | undefined>;

        const filtros: string[] = [];
        const params: (string | number)[] = [];

        if (dia) {
            filtros.push('DATE(p.DATA_PEDIDO) = ?');
            params.push(dia);
        }

        if (mes && Number.isFinite(Number(mes))) {
            filtros.push('MONTH(p.DATA_PEDIDO) = ?');
            params.push(Number(mes));
        }

        if (ano && Number.isFinite(Number(ano))) {
            filtros.push('YEAR(p.DATA_PEDIDO) = ?');
            params.push(Number(ano));
        }

        if (data_inicio) {
            filtros.push('DATE(p.DATA_PEDIDO) >= ?');
            params.push(data_inicio);
        }

        if (data_fim) {
            filtros.push('DATE(p.DATA_PEDIDO) <= ?');
            params.push(data_fim);
        }

        if (origem) {
            filtros.push('p.PLATAFORMA_ORIGEM LIKE ?');
            params.push(`%${origem}%`);
        }

        if (numero) {
            filtros.push('p.NUM_PEDIDO_PLATAFORMA LIKE ?');
            params.push(`%${numero}%`);
        }

        if (status) {
            filtros.push('p.STATUS_PEDIDO = ?');
            params.push(status);
        }

        const whereClause = filtros.length > 0 ? `WHERE ${filtros.join(' AND ')}` : '';

        const query = `
            SELECT 
                p.*,
                COALESCE(stats.QTD_TOTAL_ITENS, 0) as QTD_TOTAL_ITENS,
                stats.resumo_itens,
                COALESCE(custos.CUSTO_MATERIAIS_ESTIMADO, 0) as CUSTO_MATERIAIS_ESTIMADO,
                (COALESCE(p.VALOR_TOTAL, 0) - COALESCE(custos.CUSTO_MATERIAIS_ESTIMADO, 0)) as LUCRO_BRUTO_ESTIMADO
            FROM PEDIDO p
            LEFT JOIN (
                SELECT 
                    ip.ID_PEDIDO,
                    SUM(ip.QUANTIDADE) as QTD_TOTAL_ITENS,
                    GROUP_CONCAT(CONCAT(ip.QUANTIDADE, 'x ', pr.NOME_PRODUTO) SEPARATOR ', ') as resumo_itens
                FROM ITEM_PEDIDO ip
                JOIN PRODUTO pr ON ip.ID_PRODUTO = pr.ID_PRODUTO
                GROUP BY ip.ID_PEDIDO
            ) stats ON stats.ID_PEDIDO = p.ID_PEDIDO
            LEFT JOIN (
                SELECT
                    ip.ID_PEDIDO,
                    SUM(ip.QUANTIDADE * ft.QTD_CONSUMO * mp.CUSTO_UNITARIO) as CUSTO_MATERIAIS_ESTIMADO
                FROM ITEM_PEDIDO ip
                JOIN FICHA_TECNICA ft ON ip.ID_PRODUTO = ft.ID_PRODUTO
                JOIN MATERIA_PRIMA mp ON ft.ID_MATERIA = mp.ID_MATERIA
                GROUP BY ip.ID_PEDIDO
            ) custos ON custos.ID_PEDIDO = p.ID_PEDIDO
            ${whereClause}
            ORDER BY p.DATA_PEDIDO DESC
        `;

        const [rows] = await pool.query(query, params);
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
    const { nome_cliente, num_pedido, plataforma, itens, prazo_envio, link_arte } = req.body; 
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
        `, [nome_cliente, num_pedido, plataforma, total, prazo_envio || null, link_arte || null]);

        const novoIdPedido = result.insertId;

        // 3. Insere cada Item
        for (const item of itens) {
            await connection.query(`
                INSERT INTO ITEM_PEDIDO (ID_PEDIDO, ID_PRODUTO, QUANTIDADE, VALOR_UNITARIO)
                VALUES (?, ?, ?, ?)
            `, [novoIdPedido, item.id_produto, item.quantidade, item.valor_unitario]);
        }

        await connection.commit(); // Confirma tudo
        await registrarLog('SISTEMA', 'CRIAR_PEDIDO', `Pedido ${num_pedido} criado para ${nome_cliente}.`);
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
        await registrarLog('SISTEMA', 'ATUALIZAR_STATUS', `Status do pedido ${id} alterado para ${novo_status}.`);
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
        await registrarLog('SISTEMA', 'EXCLUIR_PEDIDO', `Pedido ${id} excluído.`);
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

export const atualizarPedido = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { nome_cliente, num_pedido, plataforma, valor_total, itens, prazo_envio, link_arte } = req.body;
    // 'itens' espera um array: [{ id_produto, quantidade, valor_unitario }]

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Atualiza os dados do cabeçalho do PEDIDO
        await connection.query(`
            UPDATE PEDIDO 
            SET NOME_CLIENTE = ?, 
                NUM_PEDIDO_PLATAFORMA = ?, 
                PLATAFORMA_ORIGEM = ?, 
                VALOR_TOTAL = ?
            WHERE ID_PEDIDO = ?
        `, [nome_cliente, num_pedido, plataforma, valor_total, prazo_envio || null, link_arte || null, id]);

        // 2. Atualiza os ITENS (Estratégia: Remove tudo e insere de novo)
        // Essa é a estratégia mais segura e simples para garantir que a lista fique igual ao front
        
        // Primeiro, limpa os itens antigos desse pedido
        await connection.query('DELETE FROM ITEM_PEDIDO WHERE ID_PEDIDO = ?', [id]);

        // Depois, insere os itens novos (se houver)
        if (itens && itens.length > 0) {
            for (const item of itens) {
                await connection.query(`
                    INSERT INTO ITEM_PEDIDO (ID_PEDIDO, ID_PRODUTO, QUANTIDADE, VALOR_UNITARIO)
                    VALUES (?, ?, ?, ?)
                `, [id, item.id_produto, item.quantidade, item.valor_unitario]);
            }
        }

        await connection.commit();
        await registrarLog('SISTEMA', 'ATUALIZAR_PEDIDO', `Pedido ${id} atualizado.`);
        res.json({ mensagem: 'Pedido atualizado com sucesso!' });

    } catch (error) {
        await connection.rollback();
        console.error('Erro ao atualizar pedido:', error);
        res.status(500).json({ mensagem: 'Erro ao atualizar pedido.' });
    } finally {
        connection.release();
    }
};

export const sincronizarPedidosShopee = async (req: Request, res: Response) => {
    const {
        dias = 7,
        data_inicio,
        data_fim,
        status,
    } = req.body || {};

    let timeFrom: number;
    let timeTo: number;

    if (data_inicio && data_fim) {
        timeFrom = converterDataParaUnixSegundos(String(data_inicio));
        timeTo = converterDataParaUnixSegundos(String(data_fim));

        if (!Number.isFinite(timeFrom) || !Number.isFinite(timeTo)) {
            return res.status(400).json({
                mensagem: 'Datas inválidas. Use formato ISO (ex: 2026-04-03T00:00:00Z).'
            });
        }
    } else {
        const diasNumero = Number(dias);
        if (!Number.isFinite(diasNumero) || diasNumero <= 0) {
            return res.status(400).json({ mensagem: 'O campo "dias" precisa ser um número maior que zero.' });
        }

        timeTo = Math.floor(Date.now() / 1000);
        timeFrom = timeTo - Math.floor(diasNumero * 24 * 60 * 60);
    }

    if (timeFrom > timeTo) {
        return res.status(400).json({ mensagem: '"data_inicio" não pode ser maior que "data_fim".' });
    }

    const connection = await pool.getConnection();

    try {
        const pedidosShopee = await buscarPedidosShopee({
            timeFrom,
            timeTo,
            orderStatus: status
        });

        if (pedidosShopee.length === 0) {
            return res.status(200).json({
                mensagem: 'Nenhum pedido retornado pela Shopee para o período informado.',
                consultados: 0,
                criados: 0,
                itensCriados: 0,
                duplicados: 0,
                skusNaoEncontrados: []
            });
        }

        await connection.beginTransaction();

        const [produtosDb]: any = await connection.query('SELECT ID_PRODUTO, SKU_PRODUTO, PRECO_VENDA FROM PRODUTO');
        const mapaProdutos = new Map<string, { id: number; preco: number }>();
        produtosDb.forEach((produto: any) => {
            const sku = String(produto.SKU_PRODUTO || '').trim().toUpperCase();
            if (sku) {
                mapaProdutos.set(sku, {
                    id: produto.ID_PRODUTO,
                    preco: Number(produto.PRECO_VENDA || 0)
                });
            }
        });

        const orderSns = pedidosShopee.map((pedido) => pedido.orderSn);
        let setDuplicados = new Set<string>();
        if (orderSns.length > 0) {
            const placeholders = orderSns.map(() => '?').join(', ');
            const [pedidosExistentes]: any = await connection.query(
                `SELECT NUM_PEDIDO_PLATAFORMA
                 FROM PEDIDO
                 WHERE PLATAFORMA_ORIGEM = 'Shopee'
                 AND NUM_PEDIDO_PLATAFORMA IN (${placeholders})`,
                orderSns
            );
            setDuplicados = new Set<string>(
                pedidosExistentes.map((pedido: any) => String(pedido.NUM_PEDIDO_PLATAFORMA))
            );
        }

        let criados = 0;
        let itensCriados = 0;
        let duplicados = 0;
        const skusNaoEncontrados = new Set<string>();

        for (const pedidoShopee of pedidosShopee) {
            if (setDuplicados.has(pedidoShopee.orderSn)) {
                duplicados++;
                continue;
            }

            const [insertPedido]: any = await connection.query(
                `INSERT INTO PEDIDO (NOME_CLIENTE, NUM_PEDIDO_PLATAFORMA, PLATAFORMA_ORIGEM, VALOR_TOTAL, DATA_PEDIDO, STATUS_PEDIDO)
                 VALUES (?, ?, 'Shopee', ?, ?, 'ENTRADA')`,
                [
                    pedidoShopee.nomeCliente,
                    pedidoShopee.orderSn,
                    pedidoShopee.valorTotal,
                    pedidoShopee.dataPedido
                ]
            );

            const idPedido = insertPedido.insertId;
            criados++;

            for (const item of pedidoShopee.itens) {
                const skuNormalizado = String(item.sku || '').trim().toUpperCase();
                const produto = mapaProdutos.get(skuNormalizado);

                if (!produto) {
                    if (skuNormalizado) {
                        skusNaoEncontrados.add(skuNormalizado);
                    }
                    continue;
                }

                await connection.query(
                    `INSERT INTO ITEM_PEDIDO (ID_PEDIDO, ID_PRODUTO, QUANTIDADE, VALOR_UNITARIO)
                     VALUES (?, ?, ?, ?)`,
                    [
                        idPedido,
                        produto.id,
                        Math.max(1, Number(item.quantidade || 1)),
                        Number(item.valorUnitario || produto.preco || 0)
                    ]
                );

                itensCriados++;
            }
        }

        await connection.commit();

        return res.status(201).json({
            mensagem: 'Sincronização Shopee concluída.',
            consultados: pedidosShopee.length,
            criados,
            itensCriados,
            duplicados,
            skusNaoEncontrados: Array.from(skusNaoEncontrados)
        });
    } catch (error: any) {
        await connection.rollback();
        console.error('Erro ao sincronizar pedidos Shopee:', error);

        const mensagem = String(error?.message || 'Erro interno ao sincronizar pedidos.');
        const statusCode = mensagem.includes('Configuração Shopee incompleta') ? 400 : 500;

        return res.status(statusCode).json({ mensagem });
    } finally {
        connection.release();
    }
};
