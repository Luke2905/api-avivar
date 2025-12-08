// src/routes/compraRoutes.ts
import { Router } from 'express';
import { listarCompras, registrarCompra } from '../controllers/compraController';
import { protegerRota } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', protegerRota, listarCompras);
router.post('/', protegerRota, registrarCompra);

export default router;