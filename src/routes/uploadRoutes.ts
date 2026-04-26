import { Router } from 'express';
import multer from 'multer';
import { uploadArte, listarArtes, deletarArte } from '../controllers/uploadController';
import { autorizarPerfis, protegerRota } from '../middlewares/authMiddleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/arte/:idPedido', protegerRota, autorizarPerfis('ADMIN', 'ARTES'), upload.single('arquivo'), uploadArte);
router.get('/arte/:idPedido', protegerRota, autorizarPerfis('ADMIN', 'ARTES', 'FINANCEIRO'), listarArtes);
router.delete('/arte/:idArquivo', protegerRota, autorizarPerfis('ADMIN', 'ARTES'), deletarArte);

export default router;
