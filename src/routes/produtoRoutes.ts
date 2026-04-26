import { Router } from 'express';
import { listarProdutos, criarProduto, excluirProduto } from '../controllers/produtoController';
import { autorizarPerfis, protegerRota } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO', 'ARTES', 'PRODUCAO'), listarProdutos);
router.post('/', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), criarProduto);
router.delete('/:id', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), excluirProduto);

export default router;
