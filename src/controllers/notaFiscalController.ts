import { Request, Response } from 'express';
import pool from '../config/database';

// Listar NFs com seus itens
export const listarNotasFiscais = async (req: Request, res: Response) => {
    try {
        const [notas]: any = await pool.query(`
            SELECT * FROM NOTA_FISCAL_ENTRADA
            ORDER BY DATA_EMISSAO DESC, ID_NOTA DESC
        `);

        // Busca todos os itens (compras vinculadas a notas)
        const [itens]: any = await pool.query(`
            SELECT c.*, m.NOME_MATERIA, m.SKU_MATERIA, m.UNIDADE_MEDIDA 
            FROM COMPRA c
            JOIN MATERIA_PRIMA m ON c.ID_MATERIA = m.ID_MATERIA
            WHERE c.ID_NOTA_FISCAL IS NOT NULL
        `);

        const notasComItens = notas.map((n: any) => ({
            ...n,
            itens: itens.filter((i: any) => i.ID_NOTA_FISCAL === n.ID_NOTA)
        }));

        res.json(notasComItens);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao listar notas fiscais' });
    }
};

// Registrar NF com múltiplos itens
export const registrarNotaFiscal = async (req: Request, res: Response) => {
    const { data_emissao, fornecedor, referencia, valor_total, status_nf, observacoes, itens } = req.body;
    // itens: [{ id_materia, qtd, custo_total }]

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        let idNota = req.body.id_nota;

        if (!idNota) {
            // 1. Cria a Nota Fiscal
            const [resultNF]: any = await connection.query(
                `INSERT INTO NOTA_FISCAL_ENTRADA (DATA_EMISSAO, FORNECEDOR, REFERENCIA, VALOR_TOTAL, STATUS_NF, OBSERVACOES)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [data_emissao, fornecedor, referencia, valor_total, status_nf, observacoes]
            );
            idNota = resultNF.insertId;
        }

        // 2. Itera sobre os itens para registrar compras e alimentar estoque
        for (const item of itens) {
            const { id_materia, qtd, custo_total } = item;

            const [materia]: any = await connection.query(
                'SELECT SALDO_ESTOQUE FROM MATERIA_PRIMA WHERE ID_MATERIA = ? FOR UPDATE',
                [id_materia]
            );

            if (materia.length === 0) throw new Error(`Materia-prima ${id_materia} nao encontrada`);
            
            const saldoAnterior = parseFloat(materia[0].SALDO_ESTOQUE);
            const novoSaldo = saldoAnterior + parseFloat(qtd);
            const novoCustoUnitario = parseFloat(custo_total) / parseFloat(qtd);

            // Insere a Compra vinculada a NF
            await connection.query(
                `INSERT INTO COMPRA (ID_MATERIA, DATA_COMPRA, QTD_COMPRADA, CUSTO_TOTAL, OBSERVACOES, ID_NOTA_FISCAL)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [id_materia, data_emissao, qtd, custo_total, observacoes || fornecedor, idNota]
            );

            // Atualiza materia-prima
            await connection.query(
                `UPDATE MATERIA_PRIMA SET SALDO_ESTOQUE = ?, CUSTO_UNITARIO = ?, FORNECEDOR = ? WHERE ID_MATERIA = ?`,
                [novoSaldo, novoCustoUnitario, fornecedor, id_materia]
            );

            // Registra movimento de estoque (Kardex)
            await connection.query(
                `INSERT INTO MOVIMENTO_ESTOQUE (ID_MATERIA, TIPO_MOVIMENTO, QTD_MOVIMENTADA, SALDO_ANTERIOR, SALDO_NOVO)
                 VALUES (?, 'ENTRADA', ?, ?, ?)`,
                [id_materia, parseFloat(qtd), saldoAnterior, novoSaldo]
            );
        }

        await connection.commit();
        res.status(idNota ? 200 : 201).json({ mensagem: 'Nota Fiscal registrada e estoque atualizado com sucesso!' });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao registrar Nota Fiscal', erro: error instanceof Error ? error.message : String(error) });
    } finally {
        connection.release();
    }
};

// Alterar Status da NF
export const atualizarStatusNotaFiscal = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status_nf } = req.body;

    try {
        await pool.query('UPDATE NOTA_FISCAL_ENTRADA SET STATUS_NF = ? WHERE ID_NOTA = ?', [status_nf, id]);
        res.json({ mensagem: 'Status atualizado com sucesso!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao atualizar status da nota fiscal' });
    }
};

// Editar Nota Fiscal e seus Itens (com Estorno)
export const editarNotaFiscal = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { data_emissao, fornecedor, referencia, valor_total, status_nf, observacoes, itens } = req.body;
    
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Reverter estoque dos itens antigos
        const [itensAntigos]: any = await connection.query('SELECT ID_MATERIA, QTD_COMPRADA FROM COMPRA WHERE ID_NOTA_FISCAL = ?', [id]);
        
        for (const item of itensAntigos) {
            const { ID_MATERIA, QTD_COMPRADA } = item;
            const [materia]: any = await connection.query('SELECT SALDO_ESTOQUE FROM MATERIA_PRIMA WHERE ID_MATERIA = ? FOR UPDATE', [ID_MATERIA]);
            if (materia.length > 0) {
                const saldoAnterior = parseFloat(materia[0].SALDO_ESTOQUE);
                const novoSaldo = saldoAnterior - parseFloat(QTD_COMPRADA);
                
                await connection.query('UPDATE MATERIA_PRIMA SET SALDO_ESTOQUE = ? WHERE ID_MATERIA = ?', [novoSaldo, ID_MATERIA]);
                
                await connection.query(
                    `INSERT INTO MOVIMENTO_ESTOQUE (ID_MATERIA, TIPO_MOVIMENTO, QTD_MOVIMENTADA, SALDO_ANTERIOR, SALDO_NOVO)
                     VALUES (?, 'ESTORNO EDICAO', ?, ?, ?)`,
                    [ID_MATERIA, parseFloat(QTD_COMPRADA), saldoAnterior, novoSaldo]
                );
            }
        }

        // 2. Apagar itens antigos
        await connection.query('DELETE FROM COMPRA WHERE ID_NOTA_FISCAL = ?', [id]);

        // 3. Atualizar cabeçalho da NF
        await connection.query(
            `UPDATE NOTA_FISCAL_ENTRADA SET DATA_EMISSAO = ?, FORNECEDOR = ?, REFERENCIA = ?, VALOR_TOTAL = ?, STATUS_NF = ?, OBSERVACOES = ? WHERE ID_NOTA = ?`,
            [data_emissao, fornecedor, referencia, valor_total, status_nf, observacoes, id]
        );

        // 4. Inserir os novos itens
        for (const item of itens) {
            const { id_materia, qtd, custo_total } = item;

            const [materia]: any = await connection.query(
                'SELECT SALDO_ESTOQUE FROM MATERIA_PRIMA WHERE ID_MATERIA = ? FOR UPDATE',
                [id_materia]
            );

            if (materia.length === 0) throw new Error(`Materia-prima ${id_materia} nao encontrada`);
            
            const saldoAnterior = parseFloat(materia[0].SALDO_ESTOQUE);
            const novoSaldo = saldoAnterior + parseFloat(qtd);
            const novoCustoUnitario = parseFloat(custo_total) / parseFloat(qtd);

            await connection.query(
                `INSERT INTO COMPRA (ID_MATERIA, DATA_COMPRA, QTD_COMPRADA, CUSTO_TOTAL, OBSERVACOES, ID_NOTA_FISCAL)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [id_materia, data_emissao, qtd, custo_total, observacoes || fornecedor, id]
            );

            await connection.query(
                `UPDATE MATERIA_PRIMA SET SALDO_ESTOQUE = ?, CUSTO_UNITARIO = ?, FORNECEDOR = ? WHERE ID_MATERIA = ?`,
                [novoSaldo, novoCustoUnitario, fornecedor, id_materia]
            );

            await connection.query(
                `INSERT INTO MOVIMENTO_ESTOQUE (ID_MATERIA, TIPO_MOVIMENTO, QTD_MOVIMENTADA, SALDO_ANTERIOR, SALDO_NOVO)
                 VALUES (?, 'ENTRADA', ?, ?, ?)`,
                [id_materia, parseFloat(qtd), saldoAnterior, novoSaldo]
            );
        }

        await connection.commit();
        res.json({ mensagem: 'Nota Fiscal editada com sucesso!' });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao editar Nota Fiscal', erro: error instanceof Error ? error.message : String(error) });
    } finally {
        connection.release();
    }
};

// Excluir Nota Fiscal (com Estorno)
export const excluirNotaFiscal = async (req: Request, res: Response) => {
    const { id } = req.params;
    
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Reverter estoque dos itens
        const [itens]: any = await connection.query('SELECT ID_MATERIA, QTD_COMPRADA FROM COMPRA WHERE ID_NOTA_FISCAL = ?', [id]);
        
        for (const item of itens) {
            const { ID_MATERIA, QTD_COMPRADA } = item;
            const [materia]: any = await connection.query('SELECT SALDO_ESTOQUE FROM MATERIA_PRIMA WHERE ID_MATERIA = ? FOR UPDATE', [ID_MATERIA]);
            if (materia.length > 0) {
                const saldoAnterior = parseFloat(materia[0].SALDO_ESTOQUE);
                const novoSaldo = saldoAnterior - parseFloat(QTD_COMPRADA);
                
                await connection.query('UPDATE MATERIA_PRIMA SET SALDO_ESTOQUE = ? WHERE ID_MATERIA = ?', [novoSaldo, ID_MATERIA]);
                
                await connection.query(
                    `INSERT INTO MOVIMENTO_ESTOQUE (ID_MATERIA, TIPO_MOVIMENTO, QTD_MOVIMENTADA, SALDO_ANTERIOR, SALDO_NOVO)
                     VALUES (?, 'Estorno de Nota Fiscal de Entrada', ?, ?, ?)`,
                    [ID_MATERIA, parseFloat(QTD_COMPRADA), saldoAnterior, novoSaldo]
                );
            }
        }

        // 2. Apagar itens
        await connection.query('DELETE FROM COMPRA WHERE ID_NOTA_FISCAL = ?', [id]);

        // 3. Apagar cabeçalho da NF
        await connection.query('DELETE FROM NOTA_FISCAL_ENTRADA WHERE ID_NOTA = ?', [id]);

        await connection.commit();
        res.json({ mensagem: 'Nota Fiscal excluída e estoque estornado com sucesso!' });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao excluir Nota Fiscal', erro: error instanceof Error ? error.message : String(error) });
    } finally {
        connection.release();
    }
};
