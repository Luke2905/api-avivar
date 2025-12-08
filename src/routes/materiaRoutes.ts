// src/routes/materiaRoutes.ts
import { Router } from 'express';
import { listarMaterias, criarMateria, atualizarSaldo } from '../controllers/materialController';
import { protegerRota } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', protegerRota, listarMaterias);
router.post('/', protegerRota, criarMateria);
router.patch('/:id/saldo', protegerRota, atualizarSaldo);

export default router;