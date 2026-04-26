import { Request, Response } from 'express';
import pool from '../config/database';

export const listarProdutos = async (req: Request, res: Response) => {
  const busca = String(req.query.busca || '').trim();

  try {
    if (busca) {
      const termo = `%${busca}%`;
      const [rows] = await pool.query(
        `SELECT *
         FROM PRODUTO
         WHERE SKU_PRODUTO LIKE ? OR NOME_PRODUTO LIKE ?
         ORDER BY NOME_PRODUTO ASC`,
        [termo, termo]
      );
      return res.json(rows);
    }

    const [rows] = await pool.query('SELECT * FROM PRODUTO ORDER BY NOME_PRODUTO ASC');
    return res.json(rows);
  } catch (error) {
    console.error('Erro ao listar produtos:', error);
    return res.status(500).json({ mensagem: 'Erro interno do servidor' });
  }
};

export const criarProduto = async (req: Request, res: Response) => {
  const { sku, nome, preco, id_categoria, impostos, mao_de_obra } = req.body;

  try {
    await pool.query(
      `INSERT INTO PRODUTO (SKU_PRODUTO, NOME_PRODUTO, PRECO_VENDA, ID_CATEGORIA, IMPOSTO_PERCENTUAL, MAO_DE_OBRA_VALOR)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sku, nome, preco, id_categoria, impostos || 0, mao_de_obra || 0]
    );

    return res.status(201).json({ mensagem: 'Produto criado com sucesso!' });
  } catch (error: any) {
    console.error('Erro ao criar produto:', error);

    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ mensagem: 'SKU já cadastrado.' });
    }

    return res.status(500).json({ mensagem: 'Erro ao salvar produto' });
  }
};

export const excluirProduto = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const [result]: any = await pool.query('DELETE FROM PRODUTO WHERE ID_PRODUTO = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ mensagem: 'Produto não encontrado.' });
    }

    return res.json({ mensagem: 'Produto excluído com sucesso.' });
  } catch (error: any) {
    console.error('Erro ao excluir produto:', error);

    if (error?.errno === 1451) {
      return res.status(400).json({ mensagem: 'Não é possível excluir: produto vinculado a pedidos ou ficha técnica.' });
    }

    return res.status(500).json({ mensagem: 'Erro ao excluir produto' });
  }
};
