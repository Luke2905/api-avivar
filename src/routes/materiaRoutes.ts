import { Router } from 'express';
import { listarMaterias, criarMateria, atualizarSaldo, editarMateria, deletarMateria, obterKardex } from '../controllers/materialController';
import { autorizarPerfis, protegerRota } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', protegerRota, autorizarPerfis('ADMIN', 'PRODUCAO', 'FINANCEIRO'), listarMaterias);
router.post('/', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), criarMateria);
router.patch('/:id/saldo', protegerRota, autorizarPerfis('ADMIN', 'PRODUCAO', 'FINANCEIRO'), atualizarSaldo);
router.put('/:id', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), editarMateria);
router.delete('/:id', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), deletarMateria);

// Rota de Relatório Kardex
router.get('/relatorio/kardex', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO', 'PRODUCAO'), obterKardex);

export default router;
