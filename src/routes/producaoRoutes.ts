import { Router } from 'express';
import { protegerRota } from '../middlewares/authMiddleware';
import { listarPedidosParaOP, listarTodasOPs, gerarNovaOP, excluirOP, listarMinhaProducao, baixarEstoquePedido } from '../controllers/producaoController';

const router = Router();
router.get('/pendentes', protegerRota, listarPedidosParaOP);
router.get('/todas', protegerRota, listarTodasOPs); // <--- Nova
router.post('/gerar', protegerRota, gerarNovaOP);
router.delete('/:id', protegerRota, excluirOP);
router.post('/minha-producao', protegerRota, listarMinhaProducao);
router.post('/:idPedido/baixar-estoque', protegerRota, baixarEstoquePedido);

export default router;