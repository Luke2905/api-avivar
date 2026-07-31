import { Router } from 'express';
import { getResumoCompras, listarCompras, registrarCompra } from '../controllers/compraController';
import { listarNotasFiscais, registrarNotaFiscal, atualizarStatusNotaFiscal, editarNotaFiscal, excluirNotaFiscal } from '../controllers/notaFiscalController';
import { autorizarPerfis, protegerRota } from '../middlewares/authMiddleware';

const router = Router();

router.get('/nota-fiscal', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO', 'COMPRADOR'), listarNotasFiscais);
router.post('/nota-fiscal', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO', 'COMPRADOR'), registrarNotaFiscal);
router.put('/nota-fiscal/:id', protegerRota, autorizarPerfis('ADMIN'), editarNotaFiscal);
router.delete('/nota-fiscal/:id', protegerRota, autorizarPerfis('ADMIN', 'COMPRADOR'), excluirNotaFiscal);
router.put('/nota-fiscal/:id/status', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO', 'COMPRADOR'), atualizarStatusNotaFiscal);

router.get('/resumo', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO', 'COMPRADOR'), getResumoCompras);
router.get('/', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO', 'COMPRADOR'), listarCompras);
router.post('/', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO', 'COMPRADOR'), registrarCompra);

export default router;
