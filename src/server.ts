import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { testarConexao } from './config/database';
import produtoRoutes from './routes/produtoRoutes';
import usuarioRoutes from './routes/usuarioRoutes';
import authRoutes from './routes/authRoutes';
import pedidoRoutes from './routes/pedidoRoutes';
import materiaRoutes from './routes/materiaRoutes';
import fichaRoutes from './routes/fichaRoutes';
import producaoRoutes from './routes/producaoRoutes';
import compraRoutes from './routes/compraRoutes';
import scannerRoutes from './routes/scannerRoutes';
import iaRoutes from './routes/iaRoutes';
import uploadRoutes from './routes/uploadRoutes';
import financeiroRoutes from './routes/financeiroRoutes';
import shopeeRoutes from './routes/shopeeRoutes';
import { sincronizarPedidosShopee, verificarEnviadosShopee } from './controllers/shopeeAuthController';

const app = express();

app.use(cors());
app.use(express.json());

// Rotas da API
app.use('/api/produtos', produtoRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/pedidos', pedidoRoutes);
app.use('/api/estoque', materiaRoutes);
app.use('/api/ficha', fichaRoutes);
app.use('/api/producao', producaoRoutes);
app.use('/api/compras', compraRoutes);
app.use('/api/scanner', scannerRoutes);
app.use('/api/ia', iaRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/financeiro', financeiroRoutes);
app.use('/api/shopee', shopeeRoutes);

app.get('/', (req, res) => {
    res.json({ mensagem: 'API Online' });
});

// ─── CRON JOBS ────────────────────────────────────────────────────────────────
// Executa sincronização da Shopee nos horários definidos (horário de Brasília UTC-3)
// Fuso compensado: cron usa UTC, então somamos 3h ao horário local desejado
//  06:00 BRT = 09:00 UTC  |  09:00 BRT = 12:00 UTC  |  12:00 BRT = 15:00 UTC
//  15:00 BRT = 18:00 UTC  |  18:30 BRT = 21:30 UTC  |  21:30 BRT = 00:30 UTC
//  00:00 BRT = 03:00 UTC

async function executarSincronizacaoAutomatica() {
    const agora = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`[CRON] Iniciando sincronização automática Shopee às ${agora} (Horário de Brasília)`);
    try {
        // Cria req/res simulados para reutilizar os handlers existentes
        const fakeReq: any = { body: { dias: 15, tipo: 'auto' } };
        const fakeRes: any = {
            status: (code: number) => ({ json: (data: any) => console.log(`[CRON] Sync Pedidos: ${code}`, JSON.stringify(data)) }),
            json: (data: any) => console.log('[CRON] Sync Pedidos:', JSON.stringify(data))
        };
        await sincronizarPedidosShopee(fakeReq, fakeRes);

        const fakeReq2: any = { body: { dias: 30, tipo: 'auto' } };
        const fakeRes2: any = {
            status: (code: number) => ({ json: (data: any) => console.log(`[CRON] Verificar Enviados: ${code}`, JSON.stringify(data)) }),
            json: (data: any) => console.log('[CRON] Verificar Enviados:', JSON.stringify(data))
        };
        await verificarEnviadosShopee(fakeReq2, fakeRes2);
    } catch (err) {
        console.error('[CRON] Erro na sincronização automática:', err);
    }
}

// Horários configurados (expressos em UTC para o cron)
// 06:00 BRT → 09:00 UTC
cron.schedule('0 9 * * *', executarSincronizacaoAutomatica);
// 09:00 BRT → 12:00 UTC
cron.schedule('0 12 * * *', executarSincronizacaoAutomatica);
// 12:00 BRT → 15:00 UTC
cron.schedule('0 15 * * *', executarSincronizacaoAutomatica);
// 15:00 BRT → 18:00 UTC
cron.schedule('0 18 * * *', executarSincronizacaoAutomatica);
// 18:30 BRT → 21:30 UTC
cron.schedule('30 21 * * *', executarSincronizacaoAutomatica);
// 21:30 BRT → 00:30 UTC (próximo dia)
cron.schedule('30 0 * * *', executarSincronizacaoAutomatica);
// 00:00 BRT → 03:00 UTC
cron.schedule('0 3 * * *', executarSincronizacaoAutomatica);

console.log('[CRON] Rotinas de sincronização automática da Shopee configuradas.');
// ──────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
    console.log(`\n⚡ Servidor rodando em: http://localhost:${PORT}`);
    await testarConexao();
});
