import { Router } from 'express';
import {
  listarUsuarios,
  criarUsuario,
  atualizarUsuario,
  deletarUsuario
} from '../controllers/usuarioController';
import { autorizarPerfis, protegerRota } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', protegerRota, autorizarPerfis('ADMIN'), listarUsuarios);
router.post('/', protegerRota, autorizarPerfis('ADMIN'), criarUsuario);
router.put('/:id', protegerRota, autorizarPerfis('ADMIN'), atualizarUsuario);
router.delete('/:id', protegerRota, autorizarPerfis('ADMIN'), deletarUsuario);

export default router;
