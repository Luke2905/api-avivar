import { Request, Response } from 'express';
import pool from '../config/database';

export const getResumoFinanceiro = async (req: Request, res: Response) => {
    try {
        // 1. FATURAMENTO (Entradas)
        const [faturamento]: any = await pool.query(`
            SELECT SUM(VALOR_TOTAL) as total FROM PEDIDO WHERE STATUS_PEDIDO != 'CANCELADO'
        `);

        // 2. A RECEBER (Simplificado: Pedidos não entregues)
        const [aReceber]: any = await pool.query(`
            SELECT SUM(VALOR_TOTAL) as total FROM PEDIDO WHERE STATUS_PEDIDO NOT IN ('CANCELADO', 'ENVIADO')
        `);

        // 3. DESPESAS OPERACIONAIS (Água, Luz, Internet)
        const [despesasOps]: any = await pool.query(`
            SELECT SUM(VALOR) as total FROM DESPESA WHERE PAGO = 1
        `);

        // 4. CUSTO COM MATÉRIA-PRIMA (Tabela COMPRA)
        // Como a tabela COMPRA não tem campo "PAGO", assumimos que Compra realizada = Dinheiro gasto.
        const [comprasMateria]: any = await pool.query(`
            SELECT SUM(CUSTO_TOTAL) as total FROM COMPRA
        `);

        // 5. CONTAS A PAGAR (Só Despesas Operacionais em aberto)
        const [contasPagar]: any = await pool.query(`
            SELECT SUM(VALOR) as total FROM DESPESA WHERE PAGO = 0
        `);

        // SOMA TUDO QUE SAIU DO BOLSO (Despesas Fixas + Compras de Insumo)
        const totalSaidas = Number(despesasOps[0].total || 0) + Number(comprasMateria[0].total || 0);

        res.json({
            faturamento: Number(faturamento[0].total || 0),
            a_receber: Number(aReceber[0].total || 0),
            despesas_pagas: totalSaidas, // Agora inclui as compras!
            contas_a_pagar: Number(contasPagar[0].total || 0),
            lucro_estimado: Number(faturamento[0].total || 0) - totalSaidas
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao calcular financeiro.' });
    }
};

// --- AQUI A MÁGICA DO UNION ---
// Trazemos tudo misturado para o extrato ficar completo
export const listarDespesas = async (req: Request, res: Response) => {
    try {
        const query = `
            SELECT * FROM (
                -- 1. Pega as Despesas Gerais
                SELECT 
                    ID_DESPESA as id, 
                    DESCRICAO as descricao, 
                    VALOR as valor, 
                    DATA_VENCIMENTO as data, 
                    CATEGORIA as categoria,
                    PAGO as pago,
                    'DESPESA' as tipo_origem
                FROM DESPESA

                UNION ALL

                -- 2. Pega as Compras de Matéria-Prima
                SELECT 
                    c.ID_COMPRA as id, 
                    CONCAT('Compra: ', m.NOME_MATERIA, ' (', c.QTD_COMPRADA, ' un)') as descricao, 
                    c.CUSTO_TOTAL as valor, 
                    c.DATA_COMPRA as data, 
                    'MATERIA_PRIMA' as categoria,
                    1 as pago, -- Assumimos compra como pago
                    'COMPRA' as tipo_origem
                FROM COMPRA c
                JOIN MATERIA_PRIMA m ON c.ID_MATERIA = m.ID_MATERIA
            ) as extrato
            ORDER BY data DESC
            LIMIT 50
        `;

        const [rows] = await pool.query(query);
        res.json(rows);

    } catch (error) {
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao listar extrato.' });
    }
};

// ... (Mantenha o criarDespesa igual estava)
export const criarDespesa = async (req: Request, res: Response) => {
    const { descricao, valor, categoria, data_vencimento, pago } = req.body;
    try {
        await pool.query(
            `INSERT INTO DESPESA (DESCRICAO, VALOR, CATEGORIA, DATA_VENCIMENTO, PAGO) VALUES (?, ?, ?, ?, ?)`,
            [descricao, valor, categoria, data_vencimento, pago ? 1 : 0]
        );
        res.status(201).json({ mensagem: 'Despesa registrada!' });
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro ao salvar despesa.' });
    }
};

export const atualizarDespesa = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { descricao, valor, categoria, data_vencimento, pago } = req.body;
    try {
        await pool.query(
            `UPDATE DESPESA SET DESCRICAO = ?, VALOR = ?, CATEGORIA = ?, DATA_VENCIMENTO = ?, PAGO = ? WHERE ID_DESPESA = ?`,
            [descricao, valor, categoria, data_vencimento, pago ? 1 : 0, id]
        );
        res.json({ mensagem: 'Despesa atualizada com sucesso!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao atualizar despesa.' });
    }
};

// EXCLUIR DESPESA (DELETE)
export const excluirDespesa = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM DESPESA WHERE ID_DESPESA = ?', [id]);
        res.json({ mensagem: 'Despesa excluída.' });
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro ao excluir despesa.' });
    }
};

// ALTERAR STATUS PAGO RAPIDAMENTE (PATCH)
export const toggleStatusDespesa = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { pago } = req.body; // Recebe true ou false
    try {
        await pool.query('UPDATE DESPESA SET PAGO = ? WHERE ID_DESPESA = ?', [pago ? 1 : 0, id]);
        res.json({ mensagem: 'Status atualizado!' });
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro ao mudar status.' });
    }
};