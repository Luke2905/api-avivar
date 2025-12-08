// src/controllers/compraController.ts
import { Request, Response } from 'express';
import pool from '../config/database';

// Listar histórico de compras
export const listarCompras = async (req: Request, res: Response) => {
    try {
        const query = `
            SELECT c.*, m.NOME_MATERIA, m.SKU_MATERIA, m.UNIDADE_MEDIDA 
            FROM COMPRA c
            JOIN MATERIA_PRIMA m ON c.ID_MATERIA = m.ID_MATERIA
            ORDER BY c.DATA_COMPRA DESC
        `;
        const [rows] = await pool.query(query);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao listar compras' });
    }
};

// Registrar nova compra (Aumenta Estoque)
export const registrarCompra = async (req: Request, res: Response) => {
    const { id_materia, data_compra, qtd, custo_total, fornecedor, obs } = req.body;

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Pega saldo e dados atuais da matéria
        const [materia]: any = await connection.query(
            'SELECT SALDO_ESTOQUE FROM MATERIA_PRIMA WHERE ID_MATERIA = ? FOR UPDATE', 
            [id_materia]
        );
        
        if (materia.length === 0) throw new Error('Matéria-prima não encontrada');
        const saldoAnterior = parseFloat(materia[0].SALDO_ESTOQUE);
        const novoSaldo = saldoAnterior + parseFloat(qtd);
        
        // Calcula novo custo unitário (Simples: Preço da última compra)
        const novoCustoUnitario = parseFloat(custo_total) / parseFloat(qtd);

        // 2. Insere a Compra
        await connection.query(`
            INSERT INTO COMPRA (ID_MATERIA, DATA_COMPRA, QTD_COMPRADA, CUSTO_TOTAL, OBSERVACOES)
            VALUES (?, ?, ?, ?, ?)
        `, [id_materia, data_compra, qtd, custo_total, obs || fornecedor]); // Usando obs para guardar fornecedor/nota

        // 3. Atualiza a Matéria-Prima (Saldo + Preço Novo)
        await connection.query(`
            UPDATE MATERIA_PRIMA 
            SET SALDO_ESTOQUE = ?, CUSTO_UNITARIO = ?, FORNECEDOR = ?
            WHERE ID_MATERIA = ?
        `, [novoSaldo, novoCustoUnitario, fornecedor, id_materia]);

        // 4. Registra no Histórico (Kardex)
        await connection.query(`
            INSERT INTO MOVIMENTO_ESTOQUE 
            (ID_MATERIA, TIPO_MOVIMENTO, QTD_MOVIMENTADA, SALDO_ANTERIOR, SALDO_NOVO)
            VALUES (?, 'ENTRADA', ?, ?, ?)
        `, [id_materia, parseFloat(qtd), saldoAnterior, novoSaldo]);

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