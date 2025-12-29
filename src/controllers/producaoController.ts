// src/controllers/producaoController.ts
import { Request, Response } from 'express';
import pool from '../config/database';

// 1. Listar pedidos pendentes (Para GERAR OP)
export const listarPedidosParaOP = async (req: Request, res: Response) => {
    try {
        const query = `
            SELECT p.* FROM PEDIDO p
            LEFT JOIN ORDEM_PRODUCAO op ON p.ID_PEDIDO = op.ID_PEDIDO
            WHERE p.STATUS_PEDIDO = 'IMPRIMINDO'
            AND op.ID_ORDEM IS NULL
        `;
        const [rows] = await pool.query(query);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao listar pedidos pendentes.' });
    }
};

// 2. Listar TODAS as OPs (Para o Grid de Gerenciamento)
export const listarTodasOPs = async (req: Request, res: Response) => {
    try {
        const query = `
            SELECT 
                op.ID_ORDEM,
                op.STATUS_OP,
                op.DATA_INICIO,
                op.RESPONSAVEL,
                p.ID_PEDIDO,
                p.NUM_PEDIDO_PLATAFORMA,
                p.NOME_CLIENTE,
                p.PLATAFORMA_ORIGEM
            FROM ORDEM_PRODUCAO op
            JOIN PEDIDO p ON op.ID_PEDIDO = p.ID_PEDIDO
            ORDER BY op.ID_ORDEM DESC
        `;
        const [rows] = await pool.query(query);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao listar OPs.' });
    }
};

// 3. Gerar Nova OP
export const gerarNovaOP = async (req: Request, res: Response) => {
    const { id_pedido } = req.body;
    const usuarioLogado = (req as any).user?.nome || 'PCP';

    try {
        await pool.query(
            'INSERT INTO ORDEM_PRODUCAO (ID_PEDIDO, RESPONSAVEL, STATUS_OP) VALUES (?, ?, "ABERTA")',
            [id_pedido, usuarioLogado]
        );
        
        // Vamos manter o status do pedido como IMPRIMINDO até alguém bipar, 
        // ou você pode mudar para AGUARDANDO_PRODUCAO se quiser diferenciar.
        
        const [resOp]: any = await pool.query('SELECT LAST_INSERT_ID() as id');
        const idOP = resOp[0].id;

        res.status(201).json({ 
            mensagem: 'Ordem de Produção Gerada!', 
            id_op: idOP,
            codigo_barras: `OP-${idOP}`
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao gerar OP.' });
    }
};

// 4. Excluir OP (E estornar pedido)
export const excluirOP = async (req: Request, res: Response) => {
    const { id } = req.params;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Pega o ID do pedido antes de deletar a OP
        const [ops]: any = await connection.query('SELECT ID_PEDIDO FROM ORDEM_PRODUCAO WHERE ID_ORDEM = ?', [id]);
        
        if (ops.length === 0) {
            await connection.rollback();
            return res.status(404).json({ mensagem: 'OP não encontrada' });
        }
        
        const idPedido = ops[0].ID_PEDIDO;

        // Deleta a OP
        await connection.query('DELETE FROM ORDEM_PRODUCAO WHERE ID_ORDEM = ?', [id]);

        // Volta o pedido para o status anterior (para poder gerar OP de novo se quiser)
        await connection.query('UPDATE PEDIDO SET STATUS_PEDIDO = "IMPRIMINDO" WHERE ID_PEDIDO = ?', [idPedido]);

        await connection.commit();
        res.json({ mensagem: 'OP excluída. Pedido voltou para a fila.' });

    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao excluir OP.' });
    } finally {
        connection.release();
    }
};

export const listarMinhaProducao = async (req: Request, res: Response) => {
    // Pega o nome exato do usuário logado
    const usuarioLogado = (req as any).user?.nome; 

    try {
        // Query Atualizada: Busca na tabela ORDEM_PRODUCAO
        const query = `
            SELECT 
                p.ID_PEDIDO, 
                op.ID_ORDEM, -- Precisamos do ID da OP para mostrar "OP-105"
                p.NUM_PEDIDO_PLATAFORMA, 
                p.NOME_CLIENTE, 
                op.DATA_INICIO,
                (
                    SELECT GROUP_CONCAT(CONCAT(ip.QUANTIDADE, 'x ', pr.NOME_PRODUTO) SEPARATOR ', ')
                    FROM ITEM_PEDIDO ip
                    JOIN PRODUTO pr ON ip.ID_PRODUTO = pr.ID_PRODUTO
                    WHERE ip.ID_PEDIDO = p.ID_PEDIDO
                ) as resumo_itens
            FROM ORDEM_PRODUCAO op
            JOIN PEDIDO p ON op.ID_PEDIDO = p.ID_PEDIDO
            WHERE op.STATUS_OP = 'EM_ANDAMENTO'
            AND op.RESPONSAVEL = ? -- Filtra pelo nome do operador
            ORDER BY op.DATA_INICIO DESC
        `;
        
        const [rows]: any = await pool.query(query, [usuarioLogado]);
        
        // Formata para o Front-end
        const listaFormatada = rows.map((r: any) => ({
            ...r,
            // Cria um campo visual bonito para a OP
            CODIGO_VISUAL: `OP-${r.ID_ORDEM}`
        }));

        res.json(listaFormatada);

    } catch (error) {
        console.error("Erro ao listar produção:", error);
        res.status(500).json({ mensagem: 'Erro ao buscar produção.' });
    }
};

export const baixarEstoquePedido = async (req: Request, res: Response) => {
    const { idPedido } = req.params;
    
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. QUERY INTELIGENTE (AGRUPADA)
        // Descobre quanto precisa de cada material para o pedido inteiro.
        // Se o pedido tem "2 Canecas" e "3 Camisetas", e ambos usam "Tinta Preta",
        // o SUM agrupa tudo para fazermos uma baixa só por material.
        const queryCalculo = `
            SELECT 
                m.ID_MATERIA,
                m.NOME_MATERIA,
                m.SALDO_ESTOQUE,
                SUM(ft.QTD_CONSUMO * ip.QUANTIDADE) as TOTAL_NECESSARIO
            FROM ITEM_PEDIDO ip
            JOIN FICHA_TECNICA ft ON ip.ID_PRODUTO = ft.ID_PRODUTO
            JOIN MATERIA_PRIMA m ON ft.ID_MATERIA = m.ID_MATERIA
            WHERE ip.ID_PEDIDO = ?
            GROUP BY m.ID_MATERIA, m.NOME_MATERIA, m.SALDO_ESTOQUE
        `;

        const [materiaisParaBaixar]: any = await connection.query(queryCalculo, [idPedido]);

        if (materiaisParaBaixar.length === 0) {
            await connection.rollback();
            // Retorna sucesso pois não é erro, é só que o produto não consome nada (ex: serviço)
            return res.json({ mensagem: 'Pedido não possui itens com ficha técnica.', insumos_baixados: 0 });
        }

        // 2. VALIDAÇÃO DE SALDO (Segurança antes de mexer)
        for (const item of materiaisParaBaixar) {
            if (Number(item.SALDO_ESTOQUE) < Number(item.TOTAL_NECESSARIO)) {
                await connection.rollback();
                return res.status(400).json({ 
                    mensagem: `Estoque insuficiente para "${item.NOME_MATERIA}". Necessário: ${item.TOTAL_NECESSARIO}, Atual: ${item.SALDO_ESTOQUE}` 
                });
            }
        }

        // 3. EXECUÇÃO (Atualiza Saldo + Grava Histórico)
        let contador = 0;

        for (const item of materiaisParaBaixar) {
            const qtdBaixar = Number(item.TOTAL_NECESSARIO);
            const saldoAntigo = Number(item.SALDO_ESTOQUE);
            const saldoNovo = saldoAntigo - qtdBaixar;

            // A) Atualiza a tabela principal (Onde mostramos no Dashboard)
            await connection.query(
                'UPDATE MATERIA_PRIMA SET SALDO_ESTOQUE = ? WHERE ID_MATERIA = ?',
                [saldoNovo, item.ID_MATERIA]
            );

            // B) Cria o LOG na tabela de movimento (Rastreabilidade)
            await connection.query(
                `INSERT INTO MOVIMENTO_ESTOQUE 
                (ID_MATERIA, TIPO_MOVIMENTO, QTD_MOVIMENTADA, SALDO_ANTERIOR, SALDO_NOVO, ID_PEDIDO_REF) 
                VALUES (?, 'SAIDA_OP', ?, ?, ?, ?)`,
                [item.ID_MATERIA, qtdBaixar, saldoAntigo, saldoNovo, idPedido]
            );

            contador++;
        }

        await connection.commit();
        
        res.json({ 
            mensagem: 'Baixa realizada e histórico registrado!', 
            insumos_baixados: contador 
        });

    } catch (error) {
        await connection.rollback();
        console.error('Erro crítico na baixa:', error);
        res.status(500).json({ mensagem: 'Erro interno ao movimentar estoque.' });
    } finally {
        connection.release();
    }
};