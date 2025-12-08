// src/controllers/scannerController.ts
import { Request, Response } from 'express';
import pool from '../config/database';

export const processarBipecagem = async (req: Request, res: Response) => {
    const { codigo } = req.body; // Espera receber algo como "OP-105" ou "105"
    const usuarioLogado = (req as any).user?.nome || 'Operador';

    // Limpeza do código: Se vier "OP-105", pega só o "105"
    const idOp = codigo.toUpperCase().replace('OP-', '').trim();

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Busca a OP pelo ID
        const [ops]: any = await connection.query(
            'SELECT * FROM ORDEM_PRODUCAO WHERE ID_ORDEM = ?', 
            [idOp]
        );

        if (ops.length === 0) {
            await connection.rollback();
            return res.status(404).json({ mensagem: `OP #${idOp} não encontrada!`, tipo: 'erro' });
        }

        const op = ops[0];
        const [pedidos]: any = await connection.query('SELECT * FROM PEDIDO WHERE ID_PEDIDO = ?', [op.ID_PEDIDO]);
        const pedido = pedidos[0];

        let mensagem = '';
        let acao = '';

        // --- LÓGICA DE ESTADOS DA OP ---

        // CENÁRIO 1: OP ABERTA -> INICIAR (EM_ANDAMENTO)
        if (op.STATUS_OP === 'ABERTA') {
            await connection.query(
                'UPDATE ORDEM_PRODUCAO SET STATUS_OP = "EM_ANDAMENTO", DATA_INICIO = NOW(), RESPONSAVEL = ? WHERE ID_ORDEM = ?',
                [usuarioLogado, idOp]
            );
            
            // Atualiza Pedido para PRODUCAO
            await connection.query('UPDATE PEDIDO SET STATUS_PEDIDO = "PRODUCAO", RESPONSAVEL_PRODUCAO = ? WHERE ID_PEDIDO = ?', [usuarioLogado, op.ID_PEDIDO]);

            acao = 'INICIO';
            mensagem = `OP #${idOp} INICIADA!`;
        }
        
        // CENÁRIO 2: EM ANDAMENTO -> CONCLUIR
        else if (op.STATUS_OP === 'EM_ANDAMENTO') {
            await connection.query(
                'UPDATE ORDEM_PRODUCAO SET STATUS_OP = "CONCLUIDA", DATA_FIM = NOW() WHERE ID_ORDEM = ?',
                [idOp]
            );

            // Atualiza Pedido para ENVIADO
            await connection.query('UPDATE PEDIDO SET STATUS_PEDIDO = "ENVIADO" WHERE ID_PEDIDO = ?', [op.ID_PEDIDO]);

            // --- BAIXA DE ESTOQUE ---
            const [itens]: any = await connection.query('SELECT * FROM ITEM_PEDIDO WHERE ID_PEDIDO = ?', [op.ID_PEDIDO]);
            for (const item of itens) {
                const [ficha]: any = await connection.query('SELECT * FROM FICHA_TECNICA WHERE ID_PRODUTO = ?', [item.ID_PRODUTO]);
                for (const ing of ficha) {
                    const qtdTotal = item.QUANTIDADE * ing.QTD_CONSUMO;
                    await connection.query('UPDATE MATERIA_PRIMA SET SALDO_ESTOQUE = SALDO_ESTOQUE - ? WHERE ID_MATERIA = ?', [qtdTotal, ing.ID_MATERIA]);
                }
            }

            acao = 'FIM';
            mensagem = `OP #${idOp} FINALIZADA!`;
        } 
        
        else {
            await connection.rollback();
            return res.json({ mensagem: `Esta OP já está CONCLUÍDA.`, tipo: 'aviso' });
        }

        // Busca itens para retorno visual
        const [itensVisuais]: any = await connection.query(`
            SELECT ip.QUANTIDADE, p.NOME_PRODUTO, p.SKU_PRODUTO 
            FROM ITEM_PEDIDO ip JOIN PRODUTO p ON ip.ID_PRODUTO = p.ID_PRODUTO
            WHERE ip.ID_PEDIDO = ?
        `, [op.ID_PEDIDO]);

        await connection.commit();

        res.json({ 
            mensagem, 
            tipo: 'sucesso', 
            acao, 
            pedido: { ...pedido, NUM_PEDIDO_PLATAFORMA: `OP-${idOp}` }, // Mostra numero da OP na tela
            itens: itensVisuais 
        });

    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao processar OP.', tipo: 'erro' });
    } finally {
        connection.release();
    }
};