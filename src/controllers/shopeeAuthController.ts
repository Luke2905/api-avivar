import { Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import pool from '../config/database';
import { registrarLog } from '../services/logService';
import { buscarPedidosShopee, buscarCatalogoShopee } from '../services/shopeeService';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parsePartnerKeyFromFile(filePath: string): string {
    if (!fs.existsSync(filePath)) return '';
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
        if (line.startsWith('#')) continue;
        if (line.includes('=')) {
            const [, value] = line.split('=');
            const parsed = value?.trim();
            if (parsed) return parsed;
        } else return line;
    }
    return '';
}

async function getShopeeConfigFromDB() {
    const [rows]: any = await pool.query('SELECT * FROM CONFIGURACAO_SHOPEE WHERE ID = 1');
    const cfg = rows[0] || {};

    // Fallback para .env se o banco não tiver credenciais ainda
    const partnerId = String(cfg.PARTNER_ID || process.env.SHOPEE_PARTNER_ID || '').trim();
    const partnerKeyEnv = String(process.env.SHOPEE_PARTNER_KEY || process.env.TEST_API_PARTNER_KEY || '').trim();
    const partnerKeyFile = parsePartnerKeyFromFile(
        process.env.SHOPEE_API_KEY_FILE || path.resolve(process.cwd(), 'api_key_shopee.txt')
    );
    const partnerKey = String(cfg.PARTNER_KEY || partnerKeyEnv || partnerKeyFile || '').trim();
    const shopId = String(cfg.SHOP_ID || process.env.SHOPEE_SHOP_ID || '').trim();
    const accessToken = String(cfg.ACCESS_TOKEN || process.env.SHOPEE_ACCESS_TOKEN || '').trim();
    const refreshToken = String(cfg.REFRESH_TOKEN || process.env.SHOPEE_REFRESH_TOKEN || '').trim();
    const shopeeHost = String(cfg.SHOPEE_HOST || process.env.SHOPEE_HOST || 'https://partner.shopeemobile.com').trim();
    const redirectUrl = String(cfg.REDIRECT_URL || process.env.SHOPEE_REDIRECT_URL || 'http://localhost:3000/api/shopee/callback').trim();
    const integracaoAtiva = Boolean(cfg.INTEGRACAO_ATIVA);
    const ultimaSincronizacao = cfg.ULTIMA_SINCRONIZACAO || null;

    return { partnerId, partnerKey, shopId, accessToken, refreshToken, shopeeHost, redirectUrl, integracaoAtiva, ultimaSincronizacao };
}

function gerarSign(partnerKey: string, partnerId: string, pathApi: string, timestamp: number) {
    const baseString = `${partnerId}${pathApi}${timestamp}`;
    return crypto.createHmac('sha256', partnerKey).update(baseString).digest('hex');
}

async function obterTimestampShopee(shopeeHost: string) {
    try {
        const response = await axios.get(shopeeHost, { maxRedirects: 0, validateStatus: () => true, timeout: 10000 });
        const serverDate = response.headers?.date;
        if (serverDate) {
            const parsed = Math.floor(new Date(serverDate).getTime() / 1000);
            if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
    } catch (_) { /* fallback */ }
    return Math.floor(Date.now() / 1000);
}

// ─── Handlers ────────────────────────────────────────────────────────────────

/** GET /api/shopee/status — Status da integração */
export const getStatusShopee = async (req: Request, res: Response) => {
    try {
        const cfg = await getShopeeConfigFromDB();
        const [countRows]: any = await pool.query(
            "SELECT COUNT(*) as total FROM PEDIDO WHERE PLATAFORMA_ORIGEM = 'Shopee'"
        );
        res.json({
            integracaoAtiva: cfg.integracaoAtiva,
            configurada: Boolean(cfg.partnerId && cfg.partnerKey && cfg.shopId),
            temToken: Boolean(cfg.accessToken),
            ultimaSincronizacao: cfg.ultimaSincronizacao,
            totalPedidosShopee: countRows[0]?.total || 0,
            shopeeHost: cfg.shopeeHost,
            redirectUrl: cfg.redirectUrl,
            partnerId: cfg.partnerId,
            shopId: cfg.shopId,
            // Nunca expõe as chaves completas
            partnerKeyConfigurada: Boolean(cfg.partnerKey),
            accessTokenConfigurado: Boolean(cfg.accessToken),
        });
    } catch (error) {
        console.error('Erro ao obter status Shopee:', error);
        res.status(500).json({ mensagem: 'Erro ao obter status da integração' });
    }
};

/** POST /api/shopee/config — Salva credenciais */
export const salvarConfigShopee = async (req: Request, res: Response) => {
    const { partner_id, partner_key, shop_id, shopee_host, redirect_url, integracao_ativa } = req.body;
    try {
        await pool.query(`
            INSERT INTO CONFIGURACAO_SHOPEE (ID, PARTNER_ID, PARTNER_KEY, SHOP_ID, SHOPEE_HOST, REDIRECT_URL, INTEGRACAO_ATIVA)
            VALUES (1, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                PARTNER_ID = COALESCE(NULLIF(?, ''), PARTNER_ID),
                PARTNER_KEY = COALESCE(NULLIF(?, ''), PARTNER_KEY),
                SHOP_ID = COALESCE(NULLIF(?, ''), SHOP_ID),
                SHOPEE_HOST = COALESCE(NULLIF(?, ''), SHOPEE_HOST),
                REDIRECT_URL = COALESCE(NULLIF(?, ''), REDIRECT_URL),
                INTEGRACAO_ATIVA = ?
        `, [
            partner_id || '', partner_key || '', shop_id || '',
            shopee_host || 'https://partner.shopeemobile.com',
            redirect_url || 'http://localhost:3000/api/shopee/callback',
            integracao_ativa ? 1 : 0,
            // ON DUPLICATE UPDATE values
            partner_id || '', partner_key || '', shop_id || '',
            shopee_host || '', redirect_url || '',
            integracao_ativa ? 1 : 0
        ]);
        await registrarLog('ADMIN', 'ATUALIZAR_CONFIG_SHOPEE', 'Configurações da integração Shopee foram atualizadas.');
        res.json({ mensagem: 'Configurações salvas com sucesso!' });
    } catch (error) {
        console.error('Erro ao salvar config Shopee:', error);
        res.status(500).json({ mensagem: 'Erro ao salvar configurações' });
    }
};

/** GET /api/shopee/autorizar — Gera link OAuth2 */
export const gerarLinkAutorizacao = async (req: Request, res: Response) => {
    try {
        const cfg = await getShopeeConfigFromDB();
        if (!cfg.partnerId || !cfg.partnerKey) {
            return res.status(400).json({ mensagem: 'Configure o Partner ID e a Partner Key antes de autorizar.' });
        }
        const pathApi = '/api/v2/shop/auth_partner';
        const timestamp = await obterTimestampShopee(cfg.shopeeHost);
        const sign = gerarSign(cfg.partnerKey, cfg.partnerId, pathApi, timestamp);
        const urlAutorizacao = `${cfg.shopeeHost}${pathApi}?partner_id=${cfg.partnerId}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(cfg.redirectUrl)}`;
        res.json({ url: urlAutorizacao });
    } catch (error: any) {
        console.error('Erro ao gerar link Shopee:', error);
        res.status(500).json({ mensagem: String(error?.message || 'Erro interno ao gerar link.') });
    }
};

/** GET /api/shopee/callback — Callback OAuth2 da Shopee */
export const callbackShopee = async (req: Request, res: Response) => {
    try {
        const cfg = await getShopeeConfigFromDB();
        const code = req.query.code as string;
        const shopId = req.query.shop_id as string;

        if (!code || !shopId) {
            return res.status(400).send('<h1>Falha na autorização. Faltou code ou shop_id.</h1>');
        }
        if (!cfg.partnerId || !cfg.partnerKey) {
            return res.status(400).send('<h1>Configuração Shopee incompleta no servidor.</h1>');
        }

        const pathApi = '/api/v2/auth/token/get';
        const timestamp = await obterTimestampShopee(cfg.shopeeHost);
        const sign = gerarSign(cfg.partnerKey, cfg.partnerId, pathApi, timestamp);

        const response = await axios.post(
            `${cfg.shopeeHost}${pathApi}`,
            { partner_id: Number(cfg.partnerId), shop_id: Number(shopId), code },
            { params: { partner_id: Number(cfg.partnerId), timestamp, sign }, timeout: 30000 }
        );

        if (response.data?.error) {
            throw new Error(`Shopee token error: ${response.data.error}`);
        }

        const accessToken = String(response.data?.access_token || response.data?.response?.access_token || '');
        const refreshToken = String(response.data?.refresh_token || response.data?.response?.refresh_token || '');
        const expireIn = Number(response.data?.expire_in || response.data?.response?.expire_in || 0);

        if (!accessToken) throw new Error('A Shopee não retornou access_token.');

        // Salva no banco
        await pool.query(`
            UPDATE CONFIGURACAO_SHOPEE SET
                SHOP_ID = ?, ACCESS_TOKEN = ?, REFRESH_TOKEN = ?, TOKEN_EXPIRE_IN = ?
            WHERE ID = 1
        `, [shopId, accessToken, refreshToken, expireIn]);

        await registrarLog('ADMIN', 'SHOPEE_TOKEN_OBTIDO', `Token Shopee obtido para loja ${shopId}.`);

        return res.send(`
            <html><body style="font-family:sans-serif;text-align:center;padding:40px">
            <h1 style="color:#0ABAB5">✅ Autorização Shopee Concluída!</h1>
            <p><strong>Shop ID:</strong> ${shopId}</p>
            <p>Token de acesso salvo com sucesso. Pode fechar esta aba e voltar ao sistema.</p>
            </body></html>
        `);
    } catch (error: any) {
        console.error('Erro no callback Shopee:', error);
        return res.status(500).send(`<h1>Erro ao concluir autorização</h1><pre>${String(error?.message || error)}</pre>`);
    }
};

/** POST /api/shopee/token — Troca code por token manualmente */
export const trocarCodePorToken = async (req: Request, res: Response) => {
    const { code, shop_id } = req.body || {};
    if (!code || !shop_id) return res.status(400).json({ mensagem: 'Informe code e shop_id.' });
    try {
        const cfg = await getShopeeConfigFromDB();
        if (!cfg.partnerId || !cfg.partnerKey) {
            return res.status(400).json({ mensagem: 'Configure o Partner ID e Partner Key antes.' });
        }
        const pathApi = '/api/v2/auth/token/get';
        const timestamp = await obterTimestampShopee(cfg.shopeeHost);
        const sign = gerarSign(cfg.partnerKey, cfg.partnerId, pathApi, timestamp);
        const response = await axios.post(
            `${cfg.shopeeHost}${pathApi}`,
            { partner_id: Number(cfg.partnerId), shop_id: Number(shop_id), code },
            { params: { partner_id: Number(cfg.partnerId), timestamp, sign }, timeout: 30000 }
        );
        if (response.data?.error) throw new Error(`Shopee token error: ${response.data.error}`);
        const accessToken = String(response.data?.access_token || '');
        const refreshToken = String(response.data?.refresh_token || '');
        const expireIn = Number(response.data?.expire_in || 0);
        if (!accessToken) throw new Error('A Shopee não retornou access_token.');
        await pool.query(`
            UPDATE CONFIGURACAO_SHOPEE SET SHOP_ID=?, ACCESS_TOKEN=?, REFRESH_TOKEN=?, TOKEN_EXPIRE_IN=? WHERE ID=1
        `, [shop_id, accessToken, refreshToken, expireIn]);
        await registrarLog('ADMIN', 'SHOPEE_TOKEN_MANUAL', `Token Shopee gerado manualmente para loja ${shop_id}.`);
        return res.json({ mensagem: 'Token Shopee gerado e salvo!', shop_id, expire_in: expireIn });
    } catch (error: any) {
        console.error('Erro ao trocar code por token:', error);
        return res.status(500).json({ mensagem: String(error?.message || 'Erro ao gerar token') });
    }
};

/** POST /api/shopee/sincronizar — Sincroniza pedidos da Shopee → Banco */
export const sincronizarPedidosShopee = async (req: Request, res: Response) => {
    try {
        const cfg = await getShopeeConfigFromDB();

        if (!cfg.integracaoAtiva) {
            return res.status(400).json({
                mensagem: 'A integração com a Shopee está desativada. Ative nas configurações.',
                codigo: 'INTEGRACAO_DESATIVADA'
            });
        }
        if (!cfg.accessToken || !cfg.shopId || !cfg.partnerId || !cfg.partnerKey) {
            return res.status(400).json({
                mensagem: 'Integração não autorizada. Complete a configuração e autorize a loja primeiro.',
                codigo: 'SEM_TOKEN'
            });
        }

        // Busca pedidos das últimas 15 dias por padrão (janela segura da API)
        const diasAtras = Number(req.body.dias || 15);
        const timeTo = Math.floor(Date.now() / 1000);
        const timeFrom = timeTo - (diasAtras * 24 * 60 * 60);

        const pedidosShopee = await buscarPedidosShopee({ timeFrom, timeTo, orderStatus: 'READY_TO_SHIP' });

        let criados = 0;
        let ignorados = 0;
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            for (const pedido of pedidosShopee) {
                // Verifica se já existe no banco
                const [existe]: any = await connection.query(
                    'SELECT ID_PEDIDO FROM PEDIDO WHERE NUM_PEDIDO_PLATAFORMA = ?',
                    [pedido.orderSn]
                );
                if (existe.length > 0) { ignorados++; continue; }

                // Insere o Pedido
                const [result]: any = await connection.query(`
                    INSERT INTO PEDIDO (NOME_CLIENTE, NUM_PEDIDO_PLATAFORMA, PLATAFORMA_ORIGEM, VALOR_TOTAL, DATA_PEDIDO, STATUS_PEDIDO)
                    VALUES (?, ?, 'Shopee', ?, ?, 'ENTRADA')
                `, [pedido.nomeCliente, pedido.orderSn, pedido.valorTotal, pedido.dataPedido]);

                const novoId = result.insertId;

                // Busca produtos pelo SKU para associar
                for (const item of pedido.itens) {
                    const skuLimpo = String(item.sku || '').trim().toUpperCase();
                    if (!skuLimpo) continue;
                    const [prodRows]: any = await connection.query(
                        'SELECT ID_PRODUTO FROM PRODUTO WHERE UPPER(TRIM(SKU_PRODUTO)) = ?', [skuLimpo]
                    );
                    let idProduto = prodRows[0]?.ID_PRODUTO || null;
                    
                    if (!idProduto) {
                        const nomeProduto = String(item.nome || `Produto Shopee ${skuLimpo}`).trim().substring(0, 200);
                        const preco = item.valorUnitario || 0;
                        const [insertProd]: any = await connection.query(
                            `INSERT INTO PRODUTO (SKU_PRODUTO, NOME_PRODUTO, PRECO_VENDA, ID_CATEGORIA, IMPOSTO_PERCENTUAL, MAO_DE_OBRA_VALOR)
                             VALUES (?, ?, ?, NULL, 0, 0)`,
                            [skuLimpo, nomeProduto, preco]
                        );
                        idProduto = insertProd.insertId;
                    }

                    if (idProduto) {
                        await connection.query(`
                            INSERT INTO ITEM_PEDIDO (ID_PEDIDO, ID_PRODUTO, QUANTIDADE, VALOR_UNITARIO)
                            VALUES (?, ?, ?, ?)
                        `, [novoId, idProduto, item.quantidade, item.valorUnitario]);
                    }
                }
                criados++;
            }

            // Atualiza data da última sincronização
            await connection.query('UPDATE CONFIGURACAO_SHOPEE SET ULTIMA_SINCRONIZACAO = NOW() WHERE ID = 1');
            await connection.commit();
        } catch (dbError) {
            await connection.rollback();
            throw dbError;
        } finally {
            connection.release();
        }

        await registrarLog('ADMIN', 'SHOPEE_SINCRONIZACAO', `Sincronização concluída: ${criados} criados, ${ignorados} já existiam.`);
        res.json({
            mensagem: `Sincronização concluída!`,
            criados,
            ignorados,
            total: pedidosShopee.length
        });
    } catch (error: any) {
        console.error('Erro ao sincronizar Shopee:', error);
        res.status(500).json({ mensagem: String(error?.message || 'Erro ao sincronizar pedidos da Shopee') });
    }
};

/** POST /api/shopee/sincronizar-produtos — Sincroniza catálogo de produtos da Shopee → Banco */
export const sincronizarCatalogoShopee = async (req: Request, res: Response) => {
    try {
        const cfg = await getShopeeConfigFromDB();

        if (!cfg.integracaoAtiva) {
            return res.status(400).json({
                mensagem: 'A integração com a Shopee está desativada. Ative nas configurações.',
                codigo: 'INTEGRACAO_DESATIVADA'
            });
        }
        if (!cfg.accessToken || !cfg.shopId || !cfg.partnerId || !cfg.partnerKey) {
            return res.status(400).json({
                mensagem: 'Integração não autorizada. Complete a configuração e autorize a loja primeiro.',
                codigo: 'SEM_TOKEN'
            });
        }

        const produtosShopee = await buscarCatalogoShopee();

        let criados = 0;
        let ignorados = 0;
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            for (const prod of produtosShopee) {
                const skuLimpo = prod.sku.toUpperCase();
                
                const [existe]: any = await connection.query(
                    'SELECT ID_PRODUTO FROM PRODUTO WHERE UPPER(TRIM(SKU_PRODUTO)) = ?',
                    [skuLimpo]
                );

                if (existe.length > 0) {
                    ignorados++;
                    continue;
                }

                await connection.query(
                    `INSERT INTO PRODUTO (SKU_PRODUTO, NOME_PRODUTO, PRECO_VENDA, ID_CATEGORIA, IMPOSTO_PERCENTUAL, MAO_DE_OBRA_VALOR)
                     VALUES (?, ?, ?, NULL, 0, 0)`,
                    [skuLimpo, prod.nome, prod.preco]
                );
                
                criados++;
            }

            await connection.commit();
        } catch (dbError) {
            await connection.rollback();
            throw dbError;
        } finally {
            connection.release();
        }

        await registrarLog('ADMIN', 'SHOPEE_SINCRONIZACAO_PRODUTOS', `Sincronização de catálogo concluída: ${criados} criados, ${ignorados} já existiam.`);
        res.json({
            mensagem: `Catálogo sincronizado com sucesso!`,
            criados,
            ignorados,
            total: produtosShopee.length
        });
    } catch (error: any) {
        console.error('Erro ao sincronizar catálogo da Shopee:', error);
        res.status(500).json({ mensagem: String(error?.message || 'Erro ao sincronizar catálogo da Shopee') });
    }
};
