// src/controllers/usuarioController.ts
import { Request, Response } from 'express';
import pool from '../config/database';
import bcrypt from 'bcryptjs';

export const registrarUsuario = async (req: Request, res: Response) => {
    // Pegamos os dados que vêm do corpo da requisição
    const { nome, email, senha, perfil } = req.body;

    try {
        // 1. Verificar se o usuário já existe
        const [usuariosExistentes]: any = await pool.query('SELECT * FROM USUARIO WHERE EMAIL_USUARIO = ?', [email]);
        if (usuariosExistentes.length > 0) {
            return res.status(400).json({ mensagem: 'E-mail já cadastrado!' });
        }

        // 2. Criptografar a senha (O segredo da Fase 2)
        const salt = await bcrypt.genSalt(10); // O "tempero" da criptografia
        const senhaHash = await bcrypt.hash(senha, salt); // A senha ilegível

        // 3. Salvar no Banco
        const query = `
            INSERT INTO USUARIO (NOME_USUARIO, EMAIL_USUARIO, SENHA_USUARIO, PERFIL_USUARIO)
            VALUES (?, ?, ?, ?)
        `;
        
        await pool.query(query, [nome, email, senhaHash, perfil || 'PRODUCAO']);

        res.status(201).json({ mensagem: 'Usuário cadastrado com segurança! 🔒' });

    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({ mensagem: 'Erro interno' });
    }
};