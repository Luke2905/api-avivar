import { Router } from 'express';
import { listarProdutos, criarProduto, excluirProduto, atualizarProduto, getProduto } from '../controllers/produtoController';
import { autorizarPerfis, protegerRota } from '../middlewares/authMiddleware';


const router = Router();

router.get('/', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO', 'ARTES', 'PRODUCAO'), listarProdutos);
router.get('/:id', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO', 'ARTES', 'PRODUCAO'), getProduto);
router.post('/', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), criarProduto);
router.put('/:id', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), atualizarProduto);
router.delete('/:id', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), excluirProduto);


export default router;
