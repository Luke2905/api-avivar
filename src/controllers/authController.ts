import { Request, Response } from 'express';
import pool from '../config/database';
import bcrypt from 'bcryptjs';
import { registrarLog } from '../services/logService';
import jwt from 'jsonwebtoken';

export const login = async (req: Request, res: Response) => {
  const { email, senha } = req.body;

  try {
    const [usuarios]: any = await pool.query('SELECT * FROM USUARIO WHERE EMAIL_USUARIO = ?', [email]);

    if (usuarios.length === 0) {
      return res.status(401).json({ mensagem: 'E-mail ou senha inválidos' });
    }

    const usuario = usuarios[0];

    if (Number(usuario.ATIVO) !== 1) {
      return res.status(403).json({ mensagem: 'Usuário inativo. Procure um administrador.' });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.SENHA_USUARIO);
    if (!senhaValida) {
      return res.status(401).json({ mensagem: 'E-mail ou senha inválidos' });
    }

    const nome = String(usuario.NOME_USUARIO || '').trim();
    const perfil = String(usuario.PERFIL_USUARIO || '').trim().toUpperCase();

    const token = jwt.sign(
      {
        id: usuario.ID_USUARIO,
        nome,
        perfil
      },
      process.env.JWT_SECRET || 'seusecret',
      { expiresIn: '8h' }
    );

    await registrarLog(nome, 'LOGIN', `Login realizado com perfil ${perfil}.`);

    return res.json({
      mensagem: 'Login realizado com sucesso!',
      token,
      usuario: {
        nome,
        email: usuario.EMAIL_USUARIO,
        perfil
      }
    });
  } catch (error) {
    console.error('Erro no login:', error);
    return res.status(500).json({ mensagem: 'Erro interno' });
  }
};
