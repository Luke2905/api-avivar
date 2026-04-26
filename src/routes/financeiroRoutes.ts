import { Router } from 'express';
import {
  getResumoFinanceiro,
  listarDespesas,
  criarDespesa,
  atualizarDespesa,
  excluirDespesa,
  toggleStatusDespesa
} from '../controllers/financeiroController';
import { autorizarPerfis, protegerRota } from '../middlewares/authMiddleware';
import { obterDREConsolidado, salvarDadosFinanceirosMensais } from '../controllers/dreController';

const router = Router();

router.get('/resumo', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), getResumoFinanceiro);
router.get('/despesas', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), listarDespesas);
router.post('/despesas', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), criarDespesa);
router.put('/despesas/:id', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), atualizarDespesa);
router.delete('/despesas/:id', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), excluirDespesa);
router.patch('/despesas/:id/status', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), toggleStatusDespesa);

router.get('/dre', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), obterDREConsolidado);
router.post('/metas', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), salvarDadosFinanceirosMensais);

export default router;
