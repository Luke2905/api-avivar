import { Router } from 'express';
import multer from 'multer';
import { uploadArte, listarArtes, deletarArte } from '../controllers/uploadController';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Rotas
router.post('/arte/:idPedido', upload.single('arquivo'), uploadArte); // Upload
router.get('/arte/:idPedido', listarArtes); // Listar galeria
router.delete('/arte/:idArquivo', deletarArte); // Deletar específico

export default router;