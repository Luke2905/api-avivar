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

async function obterCategoriaPadrao(connection: any) {
    const [rows]: any = await connection.query("SELECT ID_CATEGORIA FROM CATEGORIA WHERE NOME_CATEGORIA = 'Importados Shopee'");
    if (rows.length > 0) return rows[0].ID_CATEGORIA;
    const [result]: any = await connection.query("INSERT INTO CATEGORIA (NOME_CATEGORIA) VALUES ('Importados Shopee')");
    return result.insertId;
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
function converterDataParaUnixSegundos(valor: string) {
    const timestamp = Math.floor(new Date(valor).getTime() / 1000);
    return Number.isFinite(timestamp) ? timestamp : NaN;
}

export const sincronizarPedidosShopee = async (req: Request, res: Response) => {
    const {
        dias = 7,
        data_inicio,
        data_fim,
        status,
    } = req.body || {};

    let timeFrom: number;
    let timeTo: number;

    if (data_inicio && data_fim) {
        timeFrom = converterDataParaUnixSegundos(String(data_inicio));
        timeTo = converterDataParaUnixSegundos(String(data_fim));

        if (!Number.isFinite(timeFrom) || !Number.isFinite(timeTo)) {
            return res.status(400).json({
                mensagem: 'Datas inválidas. Use formato ISO (ex: 2026-04-03T00:00:00Z).'
            });
        }
    } else {
        const diasNumero = Number(dias);
        if (!Number.isFinite(diasNumero) || diasNumero <= 0) {
            return res.status(400).json({ mensagem: 'O campo "dias" precisa ser um número maior que zero.' });
        }

        timeTo = Math.floor(Date.now() / 1000);
        timeFrom = timeTo - Math.floor(diasNumero * 24 * 60 * 60);
    }

    if (timeFrom > timeTo) {
        return res.status(400).json({ mensagem: '"data_inicio" não pode ser maior que "data_fim".' });
    }

    const connection = await pool.getConnection();

    try {
        // Instrui o TiDB a encerrar esta sessão após 60s de inatividade,
        // evitando locks órfãos caso a conexão caia no meio da transação.
        await connection.query('SET SESSION wait_timeout = 60');

        const pedidosShopee = await buscarPedidosShopee({
            timeFrom,
            timeTo,
            orderStatus: status
        });

        if (pedidosShopee.length === 0) {
            return res.status(200).json({
                mensagem: 'Nenhum pedido retornado pela Shopee para o período informado.',
                consultados: 0,
                criados: 0,
                itensCriados: 0,
                duplicados: 0,
                skusNaoEncontrados: []
            });
        }

        await connection.beginTransaction();

        const [produtosDb]: any = await connection.query('SELECT ID_PRODUTO, SKU_PRODUTO, PRECO_VENDA FROM PRODUTO');
        const mapaProdutos = new Map<string, { id: number; preco: number }>();
        produtosDb.forEach((produto: any) => {
            const sku = String(produto.SKU_PRODUTO || '').trim().toUpperCase();
            if (sku) {
                mapaProdutos.set(sku, {
                    id: produto.ID_PRODUTO,
                    preco: Number(produto.PRECO_VENDA || 0)
                });
            }
        });

        const orderSns = pedidosShopee.map((pedido) => pedido.orderSn);
        let setDuplicados = new Set<string>();
        if (orderSns.length > 0) {
            const placeholders = orderSns.map(() => '?').join(', ');
            const [pedidosExistentes]: any = await connection.query(
                `SELECT NUM_PEDIDO_PLATAFORMA
                 FROM PEDIDO
                 WHERE PLATAFORMA_ORIGEM = 'Shopee'
                 AND NUM_PEDIDO_PLATAFORMA IN (${placeholders})`,
                orderSns
            );
            setDuplicados = new Set<string>(
                pedidosExistentes.map((pedido: any) => String(pedido.NUM_PEDIDO_PLATAFORMA))
            );
        }

        let criados = 0;
        let itensCriados = 0;
        let duplicados = 0;
        const skusNaoEncontrados = new Set<string>();

        const mapaStatus: Record<string, string> = {
            'READY_TO_SHIP': 'PRODUCAO',
            'SHIPPED': 'ENVIADO',
            'COMPLETED': 'ENVIADO',
            'CANCELLED': 'CANCELADO'
        };

        for (const pedidoShopee of pedidosShopee) {
            const statusInterno = pedidoShopee.orderStatus ? (mapaStatus[pedidoShopee.orderStatus] || 'ENTRADA') : 'ENTRADA';
            
            if (setDuplicados.has(pedidoShopee.orderSn)) {
                duplicados++;
                // Bug 3: Atualiza repasse e rastreio mesmo em pedidos duplicados
                const updateFields: string[] = [];
                const updateParams: any[] = [];
                
                if (pedidoShopee.valorRepasse !== undefined && pedidoShopee.valorRepasse !== null) {
                    updateFields.push('VALOR_REPASSE = ?');
                    updateParams.push(pedidoShopee.valorRepasse);
                } else if (pedidoShopee.valorRepasse === null || pedidoShopee.valorRepasse === undefined) {
                    console.log(`[Shopee Sync] Pedido ${pedidoShopee.orderSn} duplicado: campo de repasse ausente na API, ignorando atualização de repasse.`);
                }

                if (pedidoShopee.trackingNumber) {
                    updateFields.push('COD_RASTREIO = ?');
                    updateParams.push(pedidoShopee.trackingNumber);
                }
                
                if (pedidoShopee.orderStatus) {
                    updateFields.push('STATUS_PEDIDO = ?');
                    updateParams.push(statusInterno);
                }

                if (updateFields.length > 0) {
                    updateParams.push(pedidoShopee.orderSn);
                    await connection.query(
                        `UPDATE PEDIDO SET ${updateFields.join(', ')} WHERE NUM_PEDIDO_PLATAFORMA = ? AND PLATAFORMA_ORIGEM = 'Shopee'`,
                        updateParams
                    );
                }
                
                continue;
            }

            // Marca como já processado neste lote para evitar que itens duplicados no mesmo payload da API sejam inseridos duas vezes
            setDuplicados.add(pedidoShopee.orderSn);

            const [insertPedido]: any = await connection.query(
                `INSERT INTO PEDIDO (NOME_CLIENTE, NUM_PEDIDO_PLATAFORMA, PLATAFORMA_ORIGEM, VALOR_TOTAL, DATA_PEDIDO, STATUS_PEDIDO, PRAZO_ENVIO, COD_RASTREIO, VALOR_REPASSE, OBSERVACOES)
                 VALUES (?, ?, 'Shopee', ?, ?, ?, ?, ?, ?, ?)`,
                [
                    pedidoShopee.nomeCliente,
                    pedidoShopee.orderSn,
                    pedidoShopee.valorTotal,
                    pedidoShopee.dataPedido,
                    statusInterno,
                    pedidoShopee.prazoEnvio || null,
                    pedidoShopee.trackingNumber || null,
                    pedidoShopee.valorRepasse !== undefined ? pedidoShopee.valorRepasse : null,
                    pedidoShopee.observacoes || null
                ]
            );

            const idPedido = insertPedido.insertId;
            criados++;

            for (const item of pedidoShopee.itens) {
                const skuNormalizado = String(item.sku || '').trim().toUpperCase();
                const produto = mapaProdutos.get(skuNormalizado);

                if (!produto) {
                    if (skuNormalizado) {
                        skusNaoEncontrados.add(skuNormalizado);
                    }
                    continue;
                }

                await connection.query(
                    `INSERT INTO ITEM_PEDIDO (ID_PEDIDO, ID_PRODUTO, QUANTIDADE, VALOR_UNITARIO)
                     VALUES (?, ?, ?, ?)`,
                    [
                        idPedido,
                        produto.id,
                        Math.max(1, Number(item.quantidade || 1)),
                        Number(item.valorUnitario || produto.preco || 0)
                    ]
                );

                itensCriados++;
            }
        }
        const tipoSync = req.body.tipo === 'auto' ? 'auto' : 'manual';
        const statusSync = skusNaoEncontrados.size > 0 ? 'parcial' : 'sucesso';
        
        await connection.query(`
            INSERT INTO HISTORICO_SINCRONIZACAO_SHOPEE 
            (TIPO_SINCRONIZACAO, STATUS, QTD_CRIADOS, QTD_DUPLICADOS, QTD_SKUS_INVALIDOS, REQUISICOES_USADAS, MENSAGEM)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            tipoSync,
            statusSync,
            criados,
            duplicados,
            skusNaoEncontrados.size,
            3,
            `${criados} pedidos criados.`
        ]);

        await connection.commit();

        return res.status(201).json({
            mensagem: 'Sincronização Shopee concluída.',
            consultados: pedidosShopee.length,
            criados,
            itensCriados,
            duplicados,
            skusNaoEncontrados: Array.from(skusNaoEncontrados)
        });
    } catch (error: any) {
        await connection.rollback();
        console.error('Erro ao sincronizar pedidos Shopee:', error);

        const mensagem = String(error?.message || 'Erro interno ao sincronizar pedidos.');
        const statusCode = mensagem.includes('Configuração Shopee incompleta') ? 400 : 500;

        try {
            const connLog = await pool.getConnection();
            await connLog.query(`
                INSERT INTO HISTORICO_SINCRONIZACAO_SHOPEE 
                (TIPO_SINCRONIZACAO, STATUS, MENSAGEM, REQUISICOES_USADAS)
                VALUES (?, 'erro', ?, 1)
            `, [req.body.tipo === 'auto' ? 'auto' : 'manual', mensagem.substring(0, 500)]);
            connLog.release();
        } catch (e) {
            console.error('Erro ao gravar log de falha na sincronizacao Shopee:', e);
        }

        return res.status(statusCode).json({ mensagem });
    } finally {
        connection.release();
    }
};

/** GET /api/shopee/historico — Retorna o histórico de sincronizações */
export const obterHistoricoSync = async (req: Request, res: Response) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                ID_LOG as id,
                DATA_SINCRONIZACAO as timestamp,
                TIPO_SINCRONIZACAO as tipo,
                STATUS as status,
                QTD_CRIADOS as criados,
                QTD_DUPLICADOS as duplicados,
                QTD_SKUS_INVALIDOS as skus_invalidos,
                REQUISICOES_USADAS as chamadas_usadas,
                MENSAGEM as mensagem
            FROM HISTORICO_SINCRONIZACAO_SHOPEE
            ORDER BY DATA_SINCRONIZACAO DESC
            LIMIT 50
        `);
        return res.json(rows);
    } catch (error: any) {
        console.error('Erro ao buscar histórico Shopee:', error);
        return res.status(500).json({ mensagem: 'Erro interno ao buscar histórico.' });
    }
};
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

                const idCategoria = await obterCategoriaPadrao(connection);

                await connection.query(
                    `INSERT INTO PRODUTO (SKU_PRODUTO, NOME_PRODUTO, PRECO_VENDA, ID_CATEGORIA, IMPOSTO_PERCENTUAL, MAO_DE_OBRA_VALOR)
                     VALUES (?, ?, ?, ?, 0, 0)`,
                    [skuLimpo, prod.nome, prod.preco, idCategoria]
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

/** POST /api/shopee/verificar-enviados — Atualiza pedidos Shopee que já foram enviados */
export const verificarEnviadosShopee = async (req: Request, res: Response) => {
    try {
        const cfg = await getShopeeConfigFromDB();

        if (!cfg.integracaoAtiva) {
            return res.status(400).json({ mensagem: 'Integração Shopee desativada.', codigo: 'INTEGRACAO_DESATIVADA' });
        }
        if (!cfg.accessToken || !cfg.shopId || !cfg.partnerId || !cfg.partnerKey) {
            return res.status(400).json({ mensagem: 'Integração não autorizada.', codigo: 'SEM_TOKEN' });
        }

        // Busca pedidos com status SHIPPED na Shopee (últimos 30 dias)
        const diasAtras = Number(req.body?.dias || 30);
        const timeTo = Math.floor(Date.now() / 1000);
        const timeFrom = timeTo - (diasAtras * 24 * 60 * 60);

        const pedidosEnviados = await buscarPedidosShopee({ timeFrom, timeTo, orderStatus: 'SHIPPED' });

        if (pedidosEnviados.length === 0) {
            return res.json({ mensagem: 'Nenhum pedido enviado encontrado no período.', atualizados: 0 });
        }

        const orderSns = pedidosEnviados.map(p => p.orderSn);
        const placeholders = orderSns.map(() => '?').join(', ');

        const connection = await pool.getConnection();
        let atualizados = 0;

        try {
            await connection.beginTransaction();

            // Atualiza apenas pedidos que existem no banco E não estão já como ENVIADO
            const [result]: any = await connection.query(
                `UPDATE PEDIDO SET STATUS_PEDIDO = 'ENVIADO'
                 WHERE PLATAFORMA_ORIGEM = 'Shopee'
                 AND NUM_PEDIDO_PLATAFORMA IN (${placeholders})
                 AND STATUS_PEDIDO NOT IN ('ENVIADO', 'CANCELADO')`,
                orderSns
            );
            atualizados = result.affectedRows || 0;

            // Atualiza também COD_RASTREIO quando disponível
            for (const pedido of pedidosEnviados) {
                if (pedido.trackingNumber) {
                    await connection.query(
                        `UPDATE PEDIDO SET COD_RASTREIO = ? WHERE NUM_PEDIDO_PLATAFORMA = ? AND PLATAFORMA_ORIGEM = 'Shopee'`,
                        [pedido.trackingNumber, pedido.orderSn]
                    );
                }
            }

            // Busca IDs dos pedidos que foram efetivamente atualizados para baixar estoque
            let idsPedidosAtualizados: number[] = [];
            if (atualizados > 0) {
                const [pedidosAtualizados]: any = await connection.query(
                    `SELECT ID_PEDIDO FROM PEDIDO WHERE PLATAFORMA_ORIGEM = 'Shopee' AND NUM_PEDIDO_PLATAFORMA IN (${placeholders}) AND STATUS_PEDIDO = 'ENVIADO'`,
                    orderSns
                );
                idsPedidosAtualizados = pedidosAtualizados.map((p: any) => p.ID_PEDIDO);
            }

            await connection.commit();

            // Baixa de estoque para pedidos recém atualizados (fora da transação principal para não bloquear)
            if (idsPedidosAtualizados.length > 0) {
                const connBaixa = await pool.getConnection();
                try {
                    for (const idPedido of idsPedidosAtualizados) {
                        // Verificar se já houve baixa
                        const [jaFezBaixa]: any = await connBaixa.query(
                            `SELECT COUNT(*) as total FROM MOVIMENTO_ESTOQUE WHERE ID_PEDIDO_REF = ? AND TIPO_MOVIMENTO = 'SAIDA_OP'`,
                            [idPedido]
                        );
                        if (jaFezBaixa[0].total > 0) continue;

                        // Calcula e executa a baixa
                        const [materiais]: any = await connBaixa.query(`
                            SELECT m.ID_MATERIA, m.SALDO_ESTOQUE, SUM(ft.QTD_CONSUMO * ip.QUANTIDADE) as TOTAL_NECESSARIO
                            FROM ITEM_PEDIDO ip
                            JOIN FICHA_TECNICA ft ON ip.ID_PRODUTO = ft.ID_PRODUTO
                            JOIN MATERIA_PRIMA m ON ft.ID_MATERIA = m.ID_MATERIA
                            WHERE ip.ID_PEDIDO = ?
                            GROUP BY m.ID_MATERIA, m.SALDO_ESTOQUE
                        `, [idPedido]);

                        await connBaixa.beginTransaction();
                        for (const item of materiais) {
                            const saldoNovo = Math.max(0, Number(item.SALDO_ESTOQUE) - Number(item.TOTAL_NECESSARIO));
                            await connBaixa.query('UPDATE MATERIA_PRIMA SET SALDO_ESTOQUE = ? WHERE ID_MATERIA = ?', [saldoNovo, item.ID_MATERIA]);
                            await connBaixa.query(
                                `INSERT INTO MOVIMENTO_ESTOQUE (ID_MATERIA, TIPO_MOVIMENTO, QTD_MOVIMENTADA, SALDO_ANTERIOR, SALDO_NOVO, ID_PEDIDO_REF) VALUES (?, 'SAIDA_OP', ?, ?, ?, ?)`,
                                [item.ID_MATERIA, item.TOTAL_NECESSARIO, item.SALDO_ESTOQUE, saldoNovo, idPedido]
                            );
                        }
                        await connBaixa.commit();
                    }
                } catch (baixaErr) {
                    await connBaixa.rollback();
                    console.error('[Estoque] Erro na baixa automática via verificarEnviados:', baixaErr);
                } finally {
                    connBaixa.release();
                }
            }
        } catch (dbError) {
            await connection.rollback();
            throw dbError;
        } finally {
            connection.release();
        }

        await registrarLog('ADMIN', 'SHOPEE_VERIFICAR_ENVIADOS', `Verificação de enviados: ${atualizados} pedidos movidos para ENVIADO.`);
        res.json({
            mensagem: `Verificação concluída! ${atualizados} pedido(s) movido(s) para ENVIADO.`,
            consultados: pedidosEnviados.length,
            atualizados
        });
    } catch (error: any) {
        console.error('Erro ao verificar enviados Shopee:', error);
        res.status(500).json({ mensagem: String(error?.message || 'Erro ao verificar enviados') });
    }
};

