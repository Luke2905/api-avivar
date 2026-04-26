import { Router } from 'express';
import { processarBipecagem } from '../controllers/scannerController';
import { autorizarPerfis, protegerRota } from '../middlewares/authMiddleware';

const router = Router();

router.post('/', protegerRota, autorizarPerfis('ADMIN', 'PRODUCAO'), processarBipecagem);

export default router;
