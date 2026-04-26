import { Router } from 'express';
import { getResumoCompras, listarCompras, registrarCompra } from '../controllers/compraController';
import { autorizarPerfis, protegerRota } from '../middlewares/authMiddleware';

const router = Router();

router.get('/resumo', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), getResumoCompras);
router.get('/', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), listarCompras);
router.post('/', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), registrarCompra);

export default router;
