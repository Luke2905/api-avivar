import { Request, Response } from 'express';
import pool from '../config/database';

// GET: Listar todas (R) - MANTIDO
export const listarMaterias = async (req: Request, res: Response) => {
    try {
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

// POST: Cadastrar (C) - MANTIDO
export const criarMateria = async (req: Request, res: Response) => {
    const { sku, nome, unidade, custo, estoque_min, fornecedor } = req.body;

    try {
        const query = `
            INSERT INTO MATERIA_PRIMA 
            (SKU_MATERIA, NOME_MATERIA, UNIDADE_MEDIDA, CUSTO_UNITARIO, ESTOQUE_MINIMO, FORNECEDOR, SALDO_ESTOQUE)
            VALUES (?, ?, ?, ?, ?, ?, 0) 
        `;
        
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

// --- NOVAS FUNÇÕES ABAIXO ---

// PUT: Atualizar Cadastro Completo (U)
// Diferente do PATCH (que era só saldo), aqui atualizamos os dados cadastrais
export const editarMateria = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { sku, nome, unidade, custo, estoque_min, fornecedor } = req.body;

    try {
        const query = `
            UPDATE MATERIA_PRIMA 
            SET SKU_MATERIA = ?, NOME_MATERIA = ?, UNIDADE_MEDIDA = ?, 
                CUSTO_UNITARIO = ?, ESTOQUE_MINIMO = ?, FORNECEDOR = ?
            WHERE ID_MATERIA = ?
        `;

        await pool.query(query, [sku, nome, unidade, custo, estoque_min, fornecedor, id]);
        
        res.json({ mensagem: 'Insumo atualizado com sucesso!' });

    } catch (error: any) {
        console.error(error);
        // Tratamento se tentar mudar o SKU para um que já existe em outro produto
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ mensagem: 'Este SKU já está em uso por outro insumo.' });
        }
        res.status(500).json({ mensagem: 'Erro ao atualizar insumo.' });
    }
};

// DELETE: Remover Insumo (D)
export const deletarMateria = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        // Tenta deletar
        const [result]: any = await pool.query('DELETE FROM MATERIA_PRIMA WHERE ID_MATERIA = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ mensagem: 'Insumo não encontrado.' });
        }

        res.json({ mensagem: 'Insumo removido com sucesso!' });

    } catch (error: any) {
        console.error('Erro ao deletar:', error);
        
        // Dica de Arquiteto: Esse erro (1451) acontece se o insumo já estiver sendo usado
        // em uma Ficha Técnica de produto ou Histórico de Compras. O banco protege a integridade.
        if (error.errno === 1451) {
            return res.status(400).json({ 
                mensagem: 'Não é possível excluir: Este insumo já está vinculado a um Produto ou Histórico.' 
            });
        }
        
        res.status(500).json({ mensagem: 'Erro ao excluir insumo.' });
    }
};

// PATCH: Atualizar saldo rápido (Mantido para ajustes de inventário)
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

// GET: Relatório Kardex
export const obterKardex = async (req: Request, res: Response) => {
    const { materiaId } = req.query;
    
    try {
        let query = `
            SELECT 
                mov.ID_MOVIMENTO,
                mov.TIPO_MOVIMENTO,
                mov.QTD_MOVIMENTADA,
                mov.SALDO_ANTERIOR,
                mov.SALDO_NOVO,
                mov.DATA_MOVIMENTO,
                mat.NOME_MATERIA,
                mat.SKU_MATERIA,
                mat.UNIDADE_MEDIDA,
                ped.NUM_PEDIDO_PLATAFORMA
            FROM MOVIMENTO_ESTOQUE mov
            INNER JOIN MATERIA_PRIMA mat ON mov.ID_MATERIA = mat.ID_MATERIA
            LEFT JOIN PEDIDO ped ON mov.ID_PEDIDO_REF = ped.ID_PEDIDO
        `;
        const params: any[] = [];

        if (materiaId) {
            query += ` WHERE mov.ID_MATERIA = ? `;
            params.push(materiaId);
        }

        query += ` ORDER BY mov.DATA_MOVIMENTO DESC LIMIT 500 `;

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar Kardex:', error);
        res.status(500).json({ mensagem: 'Erro ao carregar relatório.' });
    }
};