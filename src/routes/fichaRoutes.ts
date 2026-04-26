import { Router } from 'express';
import { listarFichaDoProduto, adicionarItemFicha, removerItemFicha } from '../controllers/fichaController';
import { autorizarPerfis, protegerRota } from '../middlewares/authMiddleware';

const router = Router();

router.get('/:id_produto', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), listarFichaDoProduto);
router.post('/', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), adicionarItemFicha);
router.delete('/:id', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), removerItemFicha);

export default router;
