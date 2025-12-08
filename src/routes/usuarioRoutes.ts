// src/routes/usuarioRoutes.ts
import { Router } from 'express';
import { registrarUsuario } from '../controllers/usuarioController';

const router = Router();

// Rota para criar conta
router.post('/registro', registrarUsuario);

export default router;