import { Router } from 'express';
import { processarBipecagem } from '../controllers/scannerController';
import { protegerRota } from '../middlewares/authMiddleware';

const router = Router();
router.post('/', protegerRota, processarBipecagem);

export default router;