// src/routes/materiaRoutes.ts
import { Router } from 'express';
import { listarMaterias, criarMateria, atualizarSaldo, editarMateria, deletarMateria } from '../controllers/materialController';
import { protegerRota } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', protegerRota, listarMaterias);
router.post('/', protegerRota, criarMateria);
router.patch('/:id/saldo', protegerRota, atualizarSaldo);
router.put('/:id', protegerRota, editarMateria); // Rota de Edição
router.delete('/:id', protegerRota, deletarMateria); // Rota de Exclusão

export default router;