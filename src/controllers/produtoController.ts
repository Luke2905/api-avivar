// src/controllers/produtoController.ts
import { Request, Response } from 'express';
import pool from '../config/database';

export const listarProdutos = async (req: Request, res: Response) => {
    try {
        // Query simples para buscar produtos
        const [rows] = await pool.query('SELECT * FROM PRODUTO');
        
        // Devolve a lista pro usuário
        res.json(rows);
    } catch (error) {
        console.error('Erro ao listar produtos:', error);
        res.status(500).json({ mensagem: 'Erro interno do servidor' });
    }
};

export const criarProduto = async (req: Request, res: Response) => {
    const { sku, nome, preco, id_categoria } = req.body; // O que vem do Front-end

    try {
        const query = `
            INSERT INTO PRODUTO (SKU_PRODUTO, NOME_PRODUTO, PRECO_VENDA, ID_CATEGORIA) 
            VALUES (?, ?, ?, ?)
        `;
        await pool.query(query, [sku, nome, preco, id_categoria]);
        
        res.status(201).json({ mensagem: 'Produto criado com sucesso!' });
    } catch (error) {
        console.error('Erro ao criar produto:', error);
        res.status(500).json({ mensagem: 'Erro ao salvar produto' });
    }
};