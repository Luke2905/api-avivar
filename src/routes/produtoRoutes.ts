// src/routes/produtoRoutes.ts
import { Router } from 'express';
import { listarProdutos, criarProduto } from '../controllers/produtoController';
import { protegerRota } from '../middlewares/authMiddleware'; // <--- Importe o Porteiro

const router = Router();

// Agora as rotas estão protegidas!
// O 'protegerRota' vem antes da função do controller.
router.get('/', protegerRota, listarProdutos); 
router.post('/', protegerRota, criarProduto);

export default router;