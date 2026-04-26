import { Router } from 'express';
import { autorizarPerfis, protegerRota } from '../middlewares/authMiddleware';
import {
  listarPedidosParaOP,
  listarTodasOPs,
  gerarNovaOP,
  excluirOP,
  listarMinhaProducao,
  baixarEstoquePedido
} from '../controllers/producaoController';

const router = Router();

router.get('/pendentes', protegerRota, autorizarPerfis('ADMIN', 'PRODUCAO'), listarPedidosParaOP);
router.get('/todas', protegerRota, autorizarPerfis('ADMIN', 'PRODUCAO'), listarTodasOPs);
router.post('/gerar', protegerRota, autorizarPerfis('ADMIN', 'PRODUCAO'), gerarNovaOP);
router.delete('/:id', protegerRota, autorizarPerfis('ADMIN', 'PRODUCAO'), excluirOP);

// Mantemos GET e POST para compatibilidade durante a transição.
router.get('/minha-producao', protegerRota, autorizarPerfis('ADMIN', 'PRODUCAO'), listarMinhaProducao);
router.post('/minha-producao', protegerRota, autorizarPerfis('ADMIN', 'PRODUCAO'), listarMinhaProducao);

router.post('/:idPedido/baixar-estoque', protegerRota, autorizarPerfis('ADMIN', 'PRODUCAO'), baixarEstoquePedido);

export default router;
