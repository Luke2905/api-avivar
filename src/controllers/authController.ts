// src/controllers/authController.ts
import { Request, Response } from 'express';
import pool from '../config/database';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const login = async (req: Request, res: Response) => {
    const { email, senha } = req.body;

    try {
        // 1. Buscar o usuário pelo email
        const [usuarios]: any = await pool.query('SELECT * FROM USUARIO WHERE EMAIL_USUARIO = ?', [email]);
        
        if (usuarios.length === 0) {
            return res.status(401).json({ mensagem: 'E-mail ou senha inválidos' });
        }

        const usuario = usuarios[0];

        // 2. Verificar a senha (Bate a senha digitada com o Hash do banco?)
        const senhaValida = await bcrypt.compare(senha, usuario.SENHA_USUARIO);
        if (!senhaValida) {
            return res.status(401).json({ mensagem: 'E-mail ou senha inválidos' });
        }

        // 3. Gerar o Token (O Crachá)
        const segredo = process.env.JWT_SECRET || 'segredo_padrao';
        const token = jwt.sign(
            { 
                id: usuario.ID_USUARIO, 
                nome: usuario.NOME,   // <--- OBRIGATÓRIO: O nome tem que estar aqui!
                perfil: usuario.PERFIL 
            }, 
            process.env.JWT_SECRET || 'seusecret', 
            { expiresIn: '8h' }
        );

        // 4. Devolver o token e dados básicos (sem a senha!)
        res.json({
            mensagem: 'Login realizado com sucesso! 🔓',
            token: token,
            usuario: {
                nome: usuario.NOME_USUARIO,
                email: usuario.EMAIL_USUARIO,
                perfil: usuario.PERFIL_USUARIO
            }
        });

    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ mensagem: 'Erro interno' });
    }
};