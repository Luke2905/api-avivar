// src/controllers/materiaController.ts
import { Request, Response } from 'express';
import pool from '../config/database';

// GET: Listar todas as matérias-primas
export const listarMaterias = async (req: Request, res: Response) => {
    try {
        // Traz ordenado por quem está com estoque baixo primeiro (Prioridade!)
        const query = `
            SELECT *, 
            (SALDO_ESTOQUE <= ESTOQUE_MINIMO) as alerta_baixo 
            FROM MATERIA_PRIMA 
            ORDER BY alerta_baixo DESC, NOME_MATERIA ASC
        `;
        const [rows] = await pool.query(query);
        res.json(rows);
    } catch (error) {
        console.error('Erro ao listar estoque:', error);
        res.status(500).json({ mensagem: 'Erro ao buscar estoque' });
    }
};

// POST: Cadastrar nova matéria-prima 
export const criarMateria = async (req: Request, res: Response) => {
    const { sku, nome, unidade, custo, estoque_min, fornecedor } = req.body;

    try {
        const query = `
            INSERT INTO MATERIA_PRIMA 
            (SKU_MATERIA, NOME_MATERIA, UNIDADE_MEDIDA, CUSTO_UNITARIO, ESTOQUE_MINIMO, FORNECEDOR, SALDO_ESTOQUE)
            VALUES (?, ?, ?, ?, ?, ?, 0) 
        `;
        // Começa com saldo 0. A entrada deve ser via "Compras" (Fase 7) ou ajuste manual.
        
        await pool.query(query, [sku, nome, unidade, custo, estoque_min || 5, fornecedor]);
        res.status(201).json({ mensagem: 'Insumo cadastrado com sucesso!' });
    } catch (error: any) {
        console.error(error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ mensagem: 'SKU já existe no estoque.' });
        }
        res.status(500).json({ mensagem: 'Erro ao salvar insumo.' });
    }
};

// PATCH: Atualizar saldo rápido (Ajuste de Inventário)
export const atualizarSaldo = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { novo_saldo } = req.body;

    try {
        await pool.query('UPDATE MATERIA_PRIMA SET SALDO_ESTOQUE = ? WHERE ID_MATERIA = ?', [novo_saldo, id]);
        res.json({ mensagem: 'Estoque atualizado!' });
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro ao atualizar saldo.' });
    }
};