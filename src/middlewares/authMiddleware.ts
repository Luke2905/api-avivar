import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface TokenPayload {
  id: number;
  nome: string;
  perfil: string;
  iat: number;
  exp: number;
}

export type UserRole = 'ADMIN' | 'PRODUCAO' | 'ARTES' | 'FINANCEIRO';

export interface AuthUser {
  id: number;
  nome: string;
  perfil: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function normalizarPerfil(perfil: string) {
  return String(perfil || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

export const protegerRota = (req: Request, res: Response, next: NextFunction) => {
  const { authorization } = req.headers;

  if (!authorization) {
    return res.status(401).json({ mensagem: 'Token não fornecido' });
  }

  const token = authorization.replace('Bearer', '').trim();

  try {
    const data = jwt.verify(token, process.env.JWT_SECRET || 'seusecret');
    const { id, nome, perfil } = data as TokenPayload;

    req.user = { id, nome, perfil };
    return next();
  } catch {
    return res.status(401).json({ mensagem: 'Token inválido' });
  }
};

export const autorizarPerfis =
  (...perfisPermitidos: UserRole[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    const perfilToken = normalizarPerfil(req.user?.perfil || '');

    if (!perfilToken) {
      return res.status(403).json({ mensagem: 'Perfil de usuário não identificado.' });
    }

    const permitido = perfisPermitidos.includes(perfilToken as UserRole);
    if (!permitido) {
      return res.status(403).json({ mensagem: 'Sem permissão para acessar este recurso.' });
    }

    return next();
  };
