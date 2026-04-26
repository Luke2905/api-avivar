import { Router } from 'express';
import {
  listarPedidos,
  criarPedido,
  atualizarStatusPedido,
  obterDetalhesPedido,
  importarPedidosLote,
  excluirPedido,
  atualizarNotaFiscal,
  atualizarPedido,
  sincronizarPedidosShopee
} from '../controllers/pedidoController';
import { autorizarPerfis, protegerRota } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', protegerRota, autorizarPerfis('ADMIN', 'PRODUCAO', 'ARTES', 'FINANCEIRO'), listarPedidos);
router.get('/:id', protegerRota, autorizarPerfis('ADMIN', 'PRODUCAO', 'ARTES', 'FINANCEIRO'), obterDetalhesPedido);

router.post('/', protegerRota, autorizarPerfis('ADMIN', 'ARTES', 'FINANCEIRO'), criarPedido);
router.put('/:id', protegerRota, autorizarPerfis('ADMIN', 'ARTES', 'FINANCEIRO'), atualizarPedido);
router.delete('/:id', protegerRota, autorizarPerfis('ADMIN', 'ARTES', 'FINANCEIRO'), excluirPedido);
router.post('/importar', protegerRota, autorizarPerfis('ADMIN', 'ARTES', 'FINANCEIRO'), importarPedidosLote);
router.patch('/:id/nf', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), atualizarNotaFiscal);

router.patch('/:id/status', protegerRota, autorizarPerfis('ADMIN', 'PRODUCAO', 'ARTES', 'FINANCEIRO'), atualizarStatusPedido);
router.post('/shopee/sincronizar', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), sincronizarPedidosShopee);

export default router;
