import { Router } from 'express';
import { listarFichaDoProduto, adicionarItemFicha, removerItemFicha } from '../controllers/fichaController';
import { protegerRota } from '../middlewares/authMiddleware';

const router = Router();
router.get('/:id_produto', protegerRota, listarFichaDoProduto);
router.post('/', protegerRota, adicionarItemFicha);
router.delete('/:id', protegerRota, removerItemFicha);

export default router;