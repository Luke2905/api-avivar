import { Router } from 'express';
import { 
    getStatusShopee,
    salvarConfigShopee,
    gerarLinkAutorizacao, 
    callbackShopee, 
    trocarCodePorToken,
    sincronizarPedidosShopee
} from '../controllers/shopeeAuthController';
import { autorizarPerfis, protegerRota } from '../middlewares/authMiddleware';
import pool from '../config/database';

const router = Router();

router.get('/debug-config', async (req, res) => {
    try {
        const [rows]: any = await pool.query('SELECT * FROM CONFIGURACAO_SHOPEE');
        const dbRowsCount = rows.length;
        const firstRow = rows[0] || null;
        
        const envKeys = {
            SHOPEE_PARTNER_ID: process.env.SHOPEE_PARTNER_ID ? 'SET (length ' + process.env.SHOPEE_PARTNER_ID.length + ')' : 'NOT SET',
            SHOPEE_SHOP_ID: process.env.SHOPEE_SHOP_ID ? 'SET (length ' + process.env.SHOPEE_SHOP_ID.length + ')' : 'NOT SET',
            SHOPEE_ACCESS_TOKEN: process.env.SHOPEE_ACCESS_TOKEN ? 'SET (length ' + process.env.SHOPEE_ACCESS_TOKEN.length + ')' : 'NOT SET',
            SHOPEE_PARTNER_KEY: process.env.SHOPEE_PARTNER_KEY ? 'SET (length ' + process.env.SHOPEE_PARTNER_KEY.length + ')' : 'NOT SET',
            TEST_API_PARTNER_KEY: process.env.TEST_API_PARTNER_KEY ? 'SET (length ' + process.env.TEST_API_PARTNER_KEY.length + ')' : 'NOT SET',
            SHOPEE_BASE_URL: process.env.SHOPEE_BASE_URL || 'NOT SET',
            USE_LOCAL_DB: process.env.USE_LOCAL_DB || 'NOT SET'
        };

        res.json({
            success: true,
            dbRowsCount,
            firstRow: firstRow ? {
                ...firstRow,
                PARTNER_KEY: firstRow.PARTNER_KEY ? 'SET (length ' + firstRow.PARTNER_KEY.length + ')' : 'NOT SET',
                ACCESS_TOKEN: firstRow.ACCESS_TOKEN ? 'SET (length ' + firstRow.ACCESS_TOKEN.length + ')' : 'NOT SET',
                REFRESH_TOKEN: firstRow.REFRESH_TOKEN ? 'SET (length ' + firstRow.REFRESH_TOKEN.length + ')' : 'NOT SET'
            } : null,
            envKeys
        });
    } catch (err: any) {
        res.status(500).json({
            success: false,
            error: err.message,
            stack: err.stack
        });
    }
});

// Status e configuração (somente ADMIN)
router.get('/status', protegerRota, autorizarPerfis('ADMIN'), getStatusShopee);
router.post('/config', protegerRota, autorizarPerfis('ADMIN'), salvarConfigShopee);

// OAuth2
router.get('/autorizar', protegerRota, autorizarPerfis('ADMIN'), gerarLinkAutorizacao);
router.get('/callback', callbackShopee); // Sem proteção — a Shopee chama este endpoint diretamente
router.post('/token', protegerRota, autorizarPerfis('ADMIN'), trocarCodePorToken);

// Sincronização
router.post('/sincronizar', protegerRota, autorizarPerfis('ADMIN'), sincronizarPedidosShopee);

export default router;
