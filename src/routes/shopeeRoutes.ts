import { Router } from 'express';
import { 
    getStatusShopee,
    salvarConfigShopee,
    gerarLinkAutorizacao, 
    callbackShopee, 
    trocarCodePorToken,
    sincronizarPedidosShopee,
    sincronizarCatalogoShopee,
    verificarEnviadosShopee,
    obterHistoricoSync
} from '../controllers/shopeeAuthController';
import { autorizarPerfis, protegerRota } from '../middlewares/authMiddleware';

const router = Router();

// Status e configuração (somente ADMIN)
router.get('/status', protegerRota, autorizarPerfis('ADMIN'), getStatusShopee);
router.post('/config', protegerRota, autorizarPerfis('ADMIN'), salvarConfigShopee);

// OAuth2
router.get('/autorizar', protegerRota, autorizarPerfis('ADMIN'), gerarLinkAutorizacao);
router.get('/callback', callbackShopee); // Sem proteção — a Shopee chama este endpoint diretamente
router.post('/token', protegerRota, autorizarPerfis('ADMIN'), trocarCodePorToken);

// Sincronização
router.post('/sincronizar', protegerRota, autorizarPerfis('ADMIN'), sincronizarPedidosShopee);
router.get('/historico', protegerRota, autorizarPerfis('ADMIN'), obterHistoricoSync);
router.post('/sincronizar-produtos', protegerRota, autorizarPerfis('ADMIN'), sincronizarCatalogoShopee);
router.post('/verificar-enviados', protegerRota, autorizarPerfis('ADMIN'), verificarEnviadosShopee);

export default router;
