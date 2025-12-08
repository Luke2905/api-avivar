// src/controllers/fichaController.ts
import { Request, Response } from 'express';
import pool from '../config/database';

// Listar os insumos de um produto específico
export const listarFichaDoProduto = async (req: Request, res: Response) => {
    const { id_produto } = req.params;
    try {
        const query = `
            SELECT f.*, m.NOME_MATERIA, m.SKU_MATERIA, m.UNIDADE_MEDIDA, m.CUSTO_UNITARIO 
            FROM FICHA_TECNICA f
            JOIN MATERIA_PRIMA m ON f.ID_MATERIA = m.ID_MATERIA
            WHERE f.ID_PRODUTO = ?
        `;
        const [rows] = await pool.query(query, [id_produto]);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao carregar ficha técnica' });
    }
};

// Adicionar um insumo ao produto
export const adicionarItemFicha = async (req: Request, res: Response) => {
    const { id_produto, id_materia, qtd_consumo } = req.body;

    try {
        // Verifica se já existe esse insumo no produto para não duplicar
        const [existe]: any = await pool.query(
            'SELECT * FROM FICHA_TECNICA WHERE ID_PRODUTO = ? AND ID_MATERIA = ?',
            [id_produto, id_materia]
        );

        if (existe.length > 0) {
            return res.status(400).json({ mensagem: 'Este insumo já está na ficha do produto.' });
        }

        await pool.query(
            'INSERT INTO FICHA_TECNICA (ID_PRODUTO, ID_MATERIA, QTD_CONSUMO) VALUES (?, ?, ?)',
            [id_produto, id_materia, qtd_consumo]
        );

        res.status(201).json({ mensagem: 'Item adicionado à receita!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao salvar item da ficha' });
    }
};

// Remover item da ficha
export const removerItemFicha = async (req: Request, res: Response) => {
    const { id } = req.params; // ID da linha da ficha
    try {
        await pool.query('DELETE FROM FICHA_TECNICA WHERE ID_FICHA = ?', [id]);
        res.json({ mensagem: 'Item removido.' });
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro ao remover item' });
    }
};