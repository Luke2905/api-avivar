    import { Router } from 'express';
import { gerarPrevisoes } from '../controllers/iaController';
import { protegerRota } from '../middlewares/authMiddleware';

const router = Router();
router.get('/previsoes', protegerRota, gerarPrevisoes);
export default router;