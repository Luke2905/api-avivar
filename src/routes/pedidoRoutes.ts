// src/routes/pedidoRoutes.ts
import { Router } from 'express';
import { listarPedidos, criarPedido, atualizarStatusPedido, obterDetalhesPedido, importarPedidosLote, excluirPedido, atualizarNotaFiscal, atualizarPedido } from '../controllers/pedidoController';
import { protegerRota } from '../middlewares/authMiddleware';

const router = Router();

// Rotas existentes
router.get('/', protegerRota, listarPedidos);
router.post('/', protegerRota, criarPedido);
router.patch('/:id/status', protegerRota, atualizarStatusPedido); 
router.get('/:id', protegerRota, obterDetalhesPedido); 
router.post('/importar', protegerRota, importarPedidosLote);
router.delete('/:id', protegerRota, excluirPedido);      // Rota de Excluir
router.patch('/:id/nf', protegerRota, atualizarNotaFiscal);
router.put('/:id', protegerRota, atualizarPedido);

export default router;