// src/controllers/pedidoController.ts
import { Request, Response } from 'express';
import pool from '../config/database';
import { registrarLog } from '../services/logService';
import { buscarPedidosShopee } from '../services/shopeeService';



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
            data_fim,
            prazo_envio,
            prazo_vencido,
            prazo_amanha,
            order_by,
            order_dir
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
            // Busca por número do pedido OU código de rastreio
            filtros.push('(p.NUM_PEDIDO_PLATAFORMA LIKE ? OR p.COD_RASTREIO LIKE ?)');
            params.push(`%${numero}%`);
            params.push(`%${numero}%`);
        }

        if (status) {
            filtros.push('p.STATUS_PEDIDO = ?');
            params.push(status);
        }

        if (prazo_envio) {
            filtros.push('DATE(p.PRAZO_ENVIO) = ?');
            params.push(prazo_envio);
        }

        // Filtros rápidos de prazo
        if (prazo_vencido === 'true') {
            filtros.push('p.PRAZO_ENVIO IS NOT NULL AND DATE(p.PRAZO_ENVIO) < CURDATE()');
        }
        if (prazo_amanha === 'true') {
            filtros.push('p.PRAZO_ENVIO IS NOT NULL AND DATE(p.PRAZO_ENVIO) = DATE_ADD(CURDATE(), INTERVAL 1 DAY)');
        }

        const whereClause = filtros.length > 0 ? `WHERE ${filtros.join(' AND ')}` : '';

        // Ordenação segura com whitelist
        const COLUNAS_PERMITIDAS: Record<string, string> = {
            data: 'p.DATA_PEDIDO',
            prazo: 'p.PRAZO_ENVIO',
            valor: 'p.VALOR_TOTAL',
            cliente: 'p.NOME_CLIENTE',
            pedido: 'p.NUM_PEDIDO_PLATAFORMA',
        };
        const colunaOrdem = COLUNAS_PERMITIDAS[order_by || ''] || 'p.DATA_PEDIDO';
        const direcaoOrdem = order_dir?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

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
            ORDER BY ${colunaOrdem} ${direcaoOrdem}
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
    const { nome_cliente, num_pedido, plataforma, itens, prazo_envio, link_arte, observacoes, desconto_valor, desconto_percentual } = req.body; 
    // 'itens' deve ser um array: [{ id_produto, quantidade, valor_unitario }]

    const connection = await pool.getConnection(); // Pega conexão exclusiva para transação

    try {
        await connection.beginTransaction(); // Inicia a transação (Tudo ou Nada)

        // 1. Calcula o total somando os itens
        const subtotal = itens.reduce((acc: number, item: any) => acc + (item.quantidade * item.valor_unitario), 0);

        // 2. Aplica desconto (prioridade: valor fixo > percentual)
        let desconto = 0;
        if (Number(desconto_valor) > 0) {
            desconto = Number(desconto_valor);
        } else if (Number(desconto_percentual) > 0) {
            desconto = subtotal * (Number(desconto_percentual) / 100);
        }
        const total = Math.max(0, subtotal - desconto);

        // 3. Insere o Pedido (Cabeçalho)
        const [result]: any = await connection.query(`
            INSERT INTO PEDIDO (NOME_CLIENTE, NUM_PEDIDO_PLATAFORMA, PLATAFORMA_ORIGEM, VALOR_TOTAL, DESCONTO, DATA_PEDIDO, STATUS_PEDIDO, PRAZO_ENVIO, LINK_ARTE, OBSERVACOES)
            VALUES (?, ?, ?, ?, ?, NOW(), 'ENTRADA', ?, ?, ?)
        `, [nome_cliente, num_pedido, plataforma, total, desconto > 0 ? desconto : null, prazo_envio || null, link_arte || null, observacoes || null]);

        const novoIdPedido = result.insertId;

        // 4. Insere cada Item
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

// PATCH: Atualizar status (ja existia, mantenha igual)
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
            const skuNormalizado = String(p.SKU_PRODUTO).trim().toUpperCase();
            mapaProdutos.set(skuNormalizado, { id: p.ID_PRODUTO, preco: p.PRECO_VENDA });
        });

        console.log('--- INICIO DA IMPORTACAO ---');
        console.log(`SKUs no Banco (${mapaProdutos.size}):`, Array.from(mapaProdutos.keys()));

        for (const p of pedidos) {
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

            if (p.itens && p.itens.length > 0) {
                for (const item of p.itens) {
                    const skuBruto = item.sku;
                    const skuLimpo = String(skuBruto || '').trim().toUpperCase();
                    console.log(`Processando Item: Excel="${skuBruto}" -> Limpo="${skuLimpo}"`);
                    const produtoEncontrado = mapaProdutos.get(skuLimpo);
                    if (produtoEncontrado) {
                        await connection.query(`
                            INSERT INTO ITEM_PEDIDO (ID_PEDIDO, ID_PRODUTO, QUANTIDADE, VALOR_UNITARIO)
                            VALUES (?, ?, ?, ?)
                        `, [novoIdPedido, produtoEncontrado.id, item.qtd || 1, produtoEncontrado.preco]);
                        itensCriados++;
                    } else {
                        skusNaoEncontrados.push(skuLimpo);
                    }
                }
            }
        }

        await connection.commit();
        
        let msg = `Importacao concluida! ${pedidosCriados} pedidos e ${itensCriados} itens processados.`;
        if (skusNaoEncontrados.length > 0) {
            msg += ` ATENCAO: ${skusNaoEncontrados.length} itens ignorados por SKU invalido (Ex: ${skusNaoEncontrados[0]}).`;
        }

        res.status(201).json({ mensagem: msg });

    } catch (error) {
        await connection.rollback();
        console.error('Erro:', error);
        res.status(500).json({ mensagem: 'Erro ao processar importacao.' });
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
    const { nome_cliente, num_pedido, plataforma, valor_total, itens, prazo_envio, link_arte, observacoes } = req.body;
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
                VALOR_TOTAL = ?,
                PRAZO_ENVIO = ?,
                LINK_ARTE = ?,
                OBSERVACOES = ?
            WHERE ID_PEDIDO = ?
        `, [nome_cliente, num_pedido, plataforma, valor_total, prazo_envio || null, link_arte || null, observacoes || null, id]);

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

// PATCH: Alterar status de múltiplos pedidos (em massa)
export const alterarStatusEmMassa = async (req: Request, res: Response) => {
    const { ids, novo_status } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ mensagem: 'Forneça uma lista de IDs.' });
    }
    if (!novo_status) {
        return res.status(400).json({ mensagem: 'Informe o novo status.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const placeholders = ids.map(() => '?').join(', ');
        const [result]: any = await connection.query(
            `UPDATE PEDIDO SET STATUS_PEDIDO = ? WHERE ID_PEDIDO IN (${placeholders})`,
            [novo_status, ...ids]
        );
        await connection.commit();
        await registrarLog('SISTEMA', 'ALTERAR_STATUS_MASSA', `${result.affectedRows} pedidos movidos para ${novo_status}.`);
        res.json({ mensagem: `${result.affectedRows} pedido(s) atualizados para ${novo_status}.`, atualizados: result.affectedRows });
    } catch (error) {
        await connection.rollback();
        console.error('Erro ao alterar status em massa:', error);
        res.status(500).json({ mensagem: 'Erro ao alterar status em massa.' });
    } finally {
        connection.release();
    }
};
