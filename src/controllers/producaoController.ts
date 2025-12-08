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