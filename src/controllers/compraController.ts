import { Request, Response } from 'express';
import pool from '../config/database';

function montarFiltrosCompra(query: Request['query']) {
    const { dia, mes, ano, data_inicio, data_fim } = query as Record<string, string | undefined>;

    const filtros: string[] = [];
    const params: (string | number)[] = [];

    if (dia) {
        filtros.push('DATE(c.DATA_COMPRA) = ?');
        params.push(dia);
    }

    if (mes && Number.isFinite(Number(mes))) {
        filtros.push('MONTH(c.DATA_COMPRA) = ?');
        params.push(Number(mes));
    }

    if (ano && Number.isFinite(Number(ano))) {
        filtros.push('YEAR(c.DATA_COMPRA) = ?');
        params.push(Number(ano));
    }

    if (data_inicio) {
        filtros.push('DATE(c.DATA_COMPRA) >= ?');
        params.push(data_inicio);
    }

    if (data_fim) {
        filtros.push('DATE(c.DATA_COMPRA) <= ?');
        params.push(data_fim);
    }

    return {
        whereClause: filtros.length > 0 ? `WHERE ${filtros.join(' AND ')}` : '',
        params
    };
}

// Listar historico de compras
export const listarCompras = async (req: Request, res: Response) => {
    try {
        const { whereClause, params } = montarFiltrosCompra(req.query);

        const query = `
            SELECT c.*, m.NOME_MATERIA, m.SKU_MATERIA, m.UNIDADE_MEDIDA
            FROM COMPRA c
            JOIN MATERIA_PRIMA m ON c.ID_MATERIA = m.ID_MATERIA
            ${whereClause}
            ORDER BY c.DATA_COMPRA DESC
        `;

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao listar compras' });
    }
};

// Resumo e ranking de custos de insumos
export const getResumoCompras = async (req: Request, res: Response) => {
    try {
        const { whereClause, params } = montarFiltrosCompra(req.query);

        const [resumoRows]: any = await pool.query(
            `
            SELECT
                COUNT(*) as total_lancamentos,
                COALESCE(SUM(c.CUSTO_TOTAL), 0) as total_custo,
                COALESCE(SUM(c.QTD_COMPRADA), 0) as qtd_total_comprada,
                COALESCE(AVG(c.CUSTO_TOTAL), 0) as ticket_medio
            FROM COMPRA c
            ${whereClause}
            `,
            params
        );

        const [topInsumos]: any = await pool.query(
            `
            SELECT
                m.NOME_MATERIA,
                m.SKU_MATERIA,
                COALESCE(SUM(c.CUSTO_TOTAL), 0) as total_custo,
                COALESCE(SUM(c.QTD_COMPRADA), 0) as qtd_comprada,
                COUNT(*) as total_lancamentos
            FROM COMPRA c
            JOIN MATERIA_PRIMA m ON c.ID_MATERIA = m.ID_MATERIA
            ${whereClause}
            GROUP BY c.ID_MATERIA, m.NOME_MATERIA, m.SKU_MATERIA
            ORDER BY total_custo DESC
            LIMIT 5
            `,
            params
        );

        res.json({
            resumo: resumoRows[0] || {
                total_lancamentos: 0,
                total_custo: 0,
                qtd_total_comprada: 0,
                ticket_medio: 0
            },
            top_insumos: topInsumos || []
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao gerar resumo de compras.' });
    }
};

// Registrar nova compra (Aumenta estoque)
export const registrarCompra = async (req: Request, res: Response) => {
    const { id_materia, data_compra, qtd, custo_total, fornecedor, obs } = req.body;

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Pega saldo e dados atuais da materia
        const [materia]: any = await connection.query(
            'SELECT SALDO_ESTOQUE FROM MATERIA_PRIMA WHERE ID_MATERIA = ? FOR UPDATE',
            [id_materia]
        );

        if (materia.length === 0) throw new Error('Materia-prima nao encontrada');
        const saldoAnterior = parseFloat(materia[0].SALDO_ESTOQUE);
        const novoSaldo = saldoAnterior + parseFloat(qtd);

        // Calcula novo custo unitario (simples: preco da ultima compra)
        const novoCustoUnitario = parseFloat(custo_total) / parseFloat(qtd);

        // 2. Insere a compra
        await connection.query(
            `
            INSERT INTO COMPRA (ID_MATERIA, DATA_COMPRA, QTD_COMPRADA, CUSTO_TOTAL, OBSERVACOES)
            VALUES (?, ?, ?, ?, ?)
            `,
            [id_materia, data_compra, qtd, custo_total, obs || fornecedor]
        );

        // 3. Atualiza materia-prima (saldo + preco novo)
        await connection.query(
            `
            UPDATE MATERIA_PRIMA
            SET SALDO_ESTOQUE = ?, CUSTO_UNITARIO = ?, FORNECEDOR = ?
            WHERE ID_MATERIA = ?
            `,
            [novoSaldo, novoCustoUnitario, fornecedor, id_materia]
        );

        // 4. Registra no historico (kardex)
        await connection.query(
            `
            INSERT INTO MOVIMENTO_ESTOQUE
            (ID_MATERIA, TIPO_MOVIMENTO, QTD_MOVIMENTADA, SALDO_ANTERIOR, SALDO_NOVO)
            VALUES (?, 'ENTRADA', ?, ?, ?)
            `,
            [id_materia, parseFloat(qtd), saldoAnterior, novoSaldo]
        );

        await connection.commit();
        res.status(201).json({ mensagem: 'Compra registrada e estoque atualizado!' });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao registrar compra' });
    } finally {
        connection.release();
    }
};
