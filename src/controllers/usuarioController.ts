// src/controllers/usuarioController.ts
import { Request, Response } from 'express';
import pool from '../config/database';
import bcrypt from 'bcryptjs';

// --- 1. LISTAR (READ) ---
export const listarUsuarios = async (req: Request, res: Response) => {
    try {
        // Não trazemos a senha no SELECT por segurança
        const [rows] = await pool.query(
            `SELECT ID_USUARIO, NOME_USUARIO, EMAIL_USUARIO, PERFIL_USUARIO, ATIVO, CRIADO_EM 
             FROM USUARIO ORDER BY NOME_USUARIO ASC`
        );
        res.json(rows);
    } catch (error) {
        console.error('Erro ao listar:', error);
        res.status(500).json({ mensagem: 'Erro ao buscar usuários' });
    }
};

// --- 2. CRIAR (CREATE) - Aproveitando sua lógica ---
export const criarUsuario = async (req: Request, res: Response) => {
    const { nome, email, senha, perfil, ativo } = req.body;

    try {
        const [existe]: any = await pool.query('SELECT * FROM USUARIO WHERE EMAIL_USUARIO = ?', [email]);
        if (existe.length > 0) {
            return res.status(400).json({ mensagem: 'E-mail já cadastrado!' });
        }

        // Criptografia (Seu código original)
        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(senha, salt);

        // Status padrão é TRUE (1) se não vier nada
        const statusFinal = ativo !== undefined ? ativo : true;

        await pool.query(
            `INSERT INTO USUARIO (NOME_USUARIO, EMAIL_USUARIO, SENHA_USUARIO, PERFIL_USUARIO, ATIVO)
             VALUES (?, ?, ?, ?, ?)`,
            [nome, email, senhaHash, perfil || 'PRODUCAO', statusFinal]
        );

        res.status(201).json({ mensagem: 'Usuário criado com sucesso!' });

    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({ mensagem: 'Erro interno ao criar usuário' });
    }
};

// --- 3. ATUALIZAR (UPDATE) ---
export const atualizarUsuario = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { nome, email, perfil, ativo, senha } = req.body;

    try {
        // Cenário A: O Admin digitou uma nova senha (tem que criptografar)
        if (senha && senha.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            const senhaHash = await bcrypt.hash(senha, salt);

            await pool.query(
                `UPDATE USUARIO SET NOME_USUARIO=?, EMAIL_USUARIO=?, PERFIL_USUARIO=?, ATIVO=?, SENHA_USUARIO=? 
                 WHERE ID_USUARIO=?`,
                [nome, email, perfil, ativo, senhaHash, id]
            );
        } 
        // Cenário B: Só mudou nome/perfil (Mantém a senha velha)
        else {
            await pool.query(
                `UPDATE USUARIO SET NOME_USUARIO=?, EMAIL_USUARIO=?, PERFIL_USUARIO=?, ATIVO=? 
                 WHERE ID_USUARIO=?`,
                [nome, email, perfil, ativo, id]
            );
        }
        res.json({ mensagem: 'Dados atualizados com sucesso!' });
    } catch (error) {
        console.error('Erro ao atualizar:', error);
        res.status(500).json({ mensagem: 'Erro ao atualizar usuário' });
    }
};

// --- 4. DELETAR (DELETE) ---
export const deletarUsuario = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM USUARIO WHERE ID_USUARIO = ?', [id]);
        res.json({ mensagem: 'Usuário removido.' });
    } catch (error) {
        console.error('Erro ao deletar:', error);
        res.status(500).json({ mensagem: 'Erro ao deletar (Pode ter registros vinculados).' });
    }
};