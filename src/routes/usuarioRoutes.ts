// src/routes/usuarioRoutes.ts
import { Router } from 'express';
import { 
    listarUsuarios, 
    criarUsuario, 
    atualizarUsuario, 
    deletarUsuario 
} from '../controllers/usuarioController';

const router = Router();

// Rota: /api/usuarios

router.get('/', listarUsuarios);        // Lista todos
router.post('/', criarUsuario);         // Cria um novo (substitui o antigo /registro)
router.put('/:id', atualizarUsuario);   // Edita pelo ID
router.delete('/:id', deletarUsuario);  // Deleta pelo ID

export default router;