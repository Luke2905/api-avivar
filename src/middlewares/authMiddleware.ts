// src/middlewares/authMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface TokenPayload {
  id: number;
  nome: string; // <--- O NOME PRECISA ESTAR AQUI
  perfil: string;
  iat: number;
  exp: number;
}

export const protegerRota = (req: Request, res: Response, next: NextFunction) => {
  const { authorization } = req.headers;

  if (!authorization) {
    return res.status(401).json({ mensagem: 'Token não fornecido' });
  }

  const token = authorization.replace('Bearer', '').trim();

  try {
    const data = jwt.verify(token, process.env.JWT_SECRET || 'seusecret');
    
    // Injeta os dados do token na requisição para os controllers usarem
    const { id, nome, perfil } = data as TokenPayload;
    
    (req as any).user = { id, nome, perfil };

    return next();
  } catch {
    return res.status(401).json({ mensagem: 'Token inválido' });
  }
};