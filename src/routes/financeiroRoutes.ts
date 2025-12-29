
import { Router } from 'express';
import { getResumoFinanceiro, listarDespesas, criarDespesa, atualizarDespesa, excluirDespesa, toggleStatusDespesa } from '../controllers/financeiroController';
import { protegerRota } from '../middlewares/authMiddleware';

const router = Router();

router.get('/resumo', protegerRota, getResumoFinanceiro);
router.get('/despesas', protegerRota, listarDespesas);
router.post('/despesas', protegerRota, criarDespesa);
router.put('/despesas/:id', protegerRota, atualizarDespesa);
router.delete('/despesas/:id', protegerRota, excluirDespesa);
router.patch('/despesas/:id/status', protegerRota, toggleStatusDespesa);
export default router;