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
  alterarStatusEmMassa
} from '../controllers/pedidoController';
import { autorizarPerfis, protegerRota } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', protegerRota, autorizarPerfis('ADMIN', 'PRODUCAO', 'ARTES', 'FINANCEIRO'), listarPedidos);
router.post('/', protegerRota, autorizarPerfis('ADMIN', 'ARTES', 'FINANCEIRO'), criarPedido);

router.post('/importar', protegerRota, autorizarPerfis('ADMIN', 'ARTES', 'FINANCEIRO'), importarPedidosLote);
router.patch('/massa/status', protegerRota, autorizarPerfis('ADMIN', 'ARTES', 'FINANCEIRO'), alterarStatusEmMassa);

router.get('/:id', protegerRota, autorizarPerfis('ADMIN', 'PRODUCAO', 'ARTES', 'FINANCEIRO'), obterDetalhesPedido);
router.put('/:id', protegerRota, autorizarPerfis('ADMIN', 'ARTES', 'FINANCEIRO'), atualizarPedido);
router.delete('/:id', protegerRota, autorizarPerfis('ADMIN', 'ARTES', 'FINANCEIRO'), excluirPedido);
router.patch('/:id/nf', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), atualizarNotaFiscal);
router.patch('/:id/status', protegerRota, autorizarPerfis('ADMIN', 'PRODUCAO', 'ARTES', 'FINANCEIRO'), atualizarStatusPedido);

export default router;
