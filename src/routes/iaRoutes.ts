import { Router } from 'express';
import { gerarPrevisoes } from '../controllers/iaController';
import { autorizarPerfis, protegerRota } from '../middlewares/authMiddleware';

const router = Router();

router.get('/previsoes', protegerRota, autorizarPerfis('ADMIN', 'FINANCEIRO'), gerarPrevisoes);

export default router;
