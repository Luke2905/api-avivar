import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import pool from '../config/database';

interface ShopeeCredentials {
    partnerId: number;
    partnerKey: string;
    shopId: number;
    accessToken: string;
    baseUrl: string;
}

interface ShopeeOrderListItem {
    order_sn: string;
}

interface ShopeeOrderListResponse {
    error?: string;
    message?: string;
    response?: {
        more?: boolean;
        next_cursor?: string;
        order_list?: ShopeeOrderListItem[];
    };
}

interface ShopeeOrderDetailResponse {
    error?: string;
    message?: string;
    response?: {
        order_list?: ShopeeRawOrder[];
    };
}

interface ShopeeRawOrderItem {
    model_sku?: string;
    item_sku?: string;
    model_quantity_purchased?: number;
    item_quantity?: number;
    quantity_purchased?: number;
    model_discounted_price?: number;
    model_original_price?: number;
    item_original_price?: number;
    item_price?: number;
    item_name?: string;
    model_name?: string;
}

interface ShopeePackage {
    package_number?: string;
    logistics_status?: string;
    tracking_number?: string;
}

interface ShopeeRawOrder {
    order_sn: string;
    buyer_username?: string;
    recipient_address?: {
        name?: string;
    };
    total_amount?: number;
    actual_shipping_fee?: number;
    estimated_shipping_fee?: number;
    escrow_amount?: number;  // Valor real de repasse ao vendedor (campo oficial da Shopee Open Platform)
    create_time?: number;
    ship_by_date?: number;
    item_list?: ShopeeRawOrderItem[];
    message_to_seller?: string;
    package_list?: ShopeePackage[];
    order_status?: string;
}

export interface ShopeeOrderItem {
    sku: string;
    nome: string;
    quantidade: number;
    valorUnitario: number;
}

export interface ShopeeOrder {
    orderSn: string;
    nomeCliente: string;
    valorTotal: number;
    valorRepasse: number;
    trackingNumber: string;
    dataPedido: Date;
    prazoEnvio?: Date | null;
    itens: ShopeeOrderItem[];
    observacoes?: string;
    orderStatus?: string;
}

export interface BuscarPedidosShopeeParams {
    timeFrom: number;
    timeTo: number;
    orderStatus?: string;
}

interface ShopeeItemListResponse {
    error?: string;
    message?: string;
    response?: {
        item?: { item_id: number; item_status: string }[];
        total_count?: number;
        has_next_page?: boolean;
        next_offset?: number;
    };
}

interface ShopeeItemBaseInfoResponse {
    error?: string;
    message?: string;
    response?: {
        item_list?: {
            item_id: number;
            item_sku: string;
            item_name: string;
            has_model: boolean;
            price_info?: { original_price: number }[];
        }[];
    };
}

interface TierVariation {
    name: string;
    option_list: { option: string }[];
}

interface ShopeeModel {
    model_id: number;
    model_sku: string;
    tier_index?: number[];
    price_info?: { original_price: number }[];
}

interface ShopeeModelListResponse {
    error?: string;
    message?: string;
    response?: {
        tier_variation?: TierVariation[];
        model?: ShopeeModel[];
    };
}

export interface ShopeeProdutoMapeado {
    sku: string;
    nome: string;
    preco: number;
}


const DEFAULT_BASE_URL = 'https://partner.shopeemobile.com';
const ORDER_LIST_PATH = '/api/v2/order/get_order_list';
const ORDER_DETAIL_PATH = '/api/v2/order/get_order_detail';
const MAX_PAGE_SIZE = 100;
const DETAIL_BATCH_SIZE = 50;
const MAX_TIME_RANGE_SECONDS = 15 * 24 * 60 * 60;

function parsePartnerKeyFromFile(filePath: string): string | undefined {
    if (!fs.existsSync(filePath)) {
        return undefined;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    for (const line of lines) {
        if (line.startsWith('#')) {
            continue;
        }

        if (line.includes('=')) {
            const [, value] = line.split('=');
            const parsed = value?.trim();
            if (parsed) {
                return parsed;
            }
        } else {
            return line;
        }
    }

    return undefined;
}

async function carregarCredenciaisShopee(): Promise<ShopeeCredentials> {
    let cfg: any = {};
    try {
        const [rows]: any = await pool.query('SELECT * FROM CONFIGURACAO_SHOPEE WHERE ID = 1');
        if (rows && rows.length > 0) {
            cfg = rows[0];
        }
    } catch (error) {
        console.warn('Não foi possível ler as configurações da Shopee do banco de dados. Usando .env de fallback.', error);
    }

    const partnerIdVal = cfg.PARTNER_ID || process.env.SHOPEE_PARTNER_ID;
    const partnerId = Number(partnerIdVal);

    const shopIdVal = cfg.SHOP_ID || process.env.SHOPEE_SHOP_ID;
    const shopId = Number(shopIdVal);

    const partnerKeyFile = process.env.SHOPEE_API_KEY_FILE || path.resolve(process.cwd(), 'api_key_shopee.txt');
    const partnerKeyFromFile = parsePartnerKeyFromFile(partnerKeyFile);
    const partnerKeyFromEnv = String(process.env.SHOPEE_PARTNER_KEY || process.env.TEST_API_PARTNER_KEY || '').trim();
    const partnerKey = String(cfg.PARTNER_KEY || '').trim() || partnerKeyFromEnv || String(partnerKeyFromFile || '').trim();
    const baseUrl = (cfg.SHOPEE_HOST || process.env.SHOPEE_HOST || DEFAULT_BASE_URL).replace(/\/$/, '');

    let accessToken = String(cfg.ACCESS_TOKEN || process.env.SHOPEE_ACCESS_TOKEN || '').trim();
    let refreshToken = String(cfg.REFRESH_TOKEN || process.env.SHOPEE_REFRESH_TOKEN || '').trim();

    // Auto-refresh token if expired (4 hours lifetime)
    if (cfg.UPDATED_AT && accessToken && refreshToken && partnerId && partnerKey && shopId) {
        const updatedAtTime = new Date(cfg.UPDATED_AT).getTime();
        const expireInMs = (cfg.TOKEN_EXPIRE_IN || 14400) * 1000;
        const isExpired = Date.now() > (updatedAtTime + expireInMs - 10 * 60 * 1000); // 10 minutes safety margin

        if (isExpired) {
            try {
                console.log("[Shopee] Access token expirado/próximo de expirar. Tentando fazer refresh...");
                const pathApi = '/api/v2/auth/access_token/get';
                const timestamp = Math.floor(Date.now() / 1000);
                const baseString = `${partnerId}${pathApi}${timestamp}`;
                const sign = crypto.createHmac('sha256', partnerKey).update(baseString).digest('hex');

                const refreshResponse = await axios.post(
                    `${baseUrl}${pathApi}`,
                    {
                        refresh_token: refreshToken,
                        partner_id: partnerId,
                        shop_id: shopId
                    },
                    {
                        params: {
                            partner_id: partnerId,
                            timestamp,
                            sign
                        },
                        timeout: 30000
                    }
                );

                if (refreshResponse.data?.error) {
                    console.error("[Shopee] Erro no refresh token da Shopee:", refreshResponse.data.error, refreshResponse.data.message);
                } else {
                    const newAccessToken = String(refreshResponse.data?.access_token || refreshResponse.data?.response?.access_token || '');
                    const newRefreshToken = String(refreshResponse.data?.refresh_token || refreshResponse.data?.response?.refresh_token || '');
                    const newExpireIn = Number(refreshResponse.data?.expire_in || refreshResponse.data?.response?.expire_in || 14400);

                    if (newAccessToken) {
                        await pool.query(`
                            UPDATE CONFIGURACAO_SHOPEE SET
                                ACCESS_TOKEN = ?, REFRESH_TOKEN = ?, TOKEN_EXPIRE_IN = ?, UPDATED_AT = NOW()
                            WHERE ID = 1
                        `, [newAccessToken, newRefreshToken, newExpireIn]);
                        
                        console.log("[Shopee] Access token atualizado com sucesso!");
                        accessToken = newAccessToken;
                        refreshToken = newRefreshToken;
                    }
                }
            } catch (refreshErr) {
                console.error("[Shopee] Falha ao tentar atualizar o token da Shopee:", refreshErr);
            }
        }
    }

    const faltantes: string[] = [];

    if (!Number.isFinite(partnerId) || partnerId <= 0) {
        faltantes.push('SHOPEE_PARTNER_ID');
    }
    if (!Number.isFinite(shopId) || shopId <= 0) {
        faltantes.push('SHOPEE_SHOP_ID');
    }
    if (!accessToken) {
        faltantes.push('SHOPEE_ACCESS_TOKEN');
    }
    if (!partnerKey) {
        faltantes.push('SHOPEE_PARTNER_KEY (ou arquivo api_key_shopee.txt)');
    }

    if (faltantes.length > 0) {
        throw new Error(`Configuração Shopee incompleta. Variáveis faltando: ${faltantes.join(', ')}`);
    }

    return {
        partnerId,
        partnerKey,
        shopId,
        accessToken,
        baseUrl
    };
}

function gerarAssinatura(
    partnerKey: string,
    partnerId: number,
    apiPath: string,
    timestamp: number,
    accessToken: string,
    shopId: number
) {
    const baseString = `${partnerId}${apiPath}${timestamp}${accessToken}${shopId}`;
    return crypto.createHmac('sha256', partnerKey).update(baseString).digest('hex');
}

function toNumber(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function mapearPedidoShopee(rawOrder: ShopeeRawOrder): ShopeeOrder {
    const itens = (rawOrder.item_list || []).map((item) => ({
        sku: String(item.model_sku || item.item_sku || '').trim(),
        nome: String(item.item_name || item.model_name || 'Item Shopee'),
        quantidade: Math.max(1, toNumber(
            item.model_quantity_purchased ?? item.item_quantity ?? item.quantity_purchased,
            1
        )),
        valorUnitario: Math.max(0, toNumber(
            item.model_discounted_price ?? item.model_original_price ?? item.item_original_price ?? item.item_price,
            0
        ))
    }));

    const totalItens = itens.reduce((acc, item) => acc + (item.quantidade * item.valorUnitario), 0);
    const valorTotal = Math.max(0, toNumber(rawOrder.total_amount, totalItens));
    // Valor de repasse: usa escrow_amount (campo oficial da API Shopee) quando disponível.
    // Fallback: total - frete estimado (menos preciso, mas funciona antes do pagamento ser liberado)
    let valorRepasse: number;
    if (rawOrder.escrow_amount !== undefined && rawOrder.escrow_amount !== null) {
        valorRepasse = Math.max(0, toNumber(rawOrder.escrow_amount, 0));
    } else {
        const freteVendedor = toNumber(rawOrder.actual_shipping_fee ?? rawOrder.estimated_shipping_fee, 0);
        valorRepasse = Math.max(0, valorTotal - freteVendedor);
    }

    // Tracking number — extraído do primeiro pacote da lista
    const primeiroPackage = (rawOrder.package_list || [])[0];
    const trackingNumber = String(primeiroPackage?.tracking_number || '').trim();

    const createTime = toNumber(rawOrder.create_time, Math.floor(Date.now() / 1000));
    const shipByDate = rawOrder.ship_by_date ? new Date(rawOrder.ship_by_date * 1000) : null;
    const nomeCliente = String(
        rawOrder.buyer_username || rawOrder.recipient_address?.name || 'Cliente Shopee'
    ).trim() || 'Cliente Shopee';

    return {
        orderSn: rawOrder.order_sn,
        nomeCliente,
        valorTotal,
        valorRepasse,
        trackingNumber,
        dataPedido: new Date(createTime * 1000),
        prazoEnvio: shipByDate,
        itens,
        observacoes: rawOrder.message_to_seller || '',
        orderStatus: rawOrder.order_status
    };
}

function dividirEmLotes<T>(items: T[], tamanhoLote: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += tamanhoLote) {
        batches.push(items.slice(i, i + tamanhoLote));
    }
    return batches;
}

class ShopeeService {
    private readonly credentials: ShopeeCredentials;
    private readonly client: AxiosInstance;

    constructor(credentials: ShopeeCredentials) {
        this.credentials = credentials;
        this.client = axios.create({
            baseURL: this.credentials.baseUrl,
            timeout: 30000
        });
    }

    private async obterTimestampShopee() {
        try {
            const response = await this.client.get('/', {
                maxRedirects: 0,
                validateStatus: () => true
            });

            const serverDate = response.headers?.date;
            if (serverDate) {
                const parsed = Math.floor(new Date(serverDate).getTime() / 1000);
                if (Number.isFinite(parsed) && parsed > 0) {
                    return parsed;
                }
            }
        } catch (error) {
            // fallback para horário local
        }

        return Math.floor(Date.now() / 1000);
    }

    private authParams(apiPath: string, timestamp: number) {
        const sign = gerarAssinatura(
            this.credentials.partnerKey,
            this.credentials.partnerId,
            apiPath,
            timestamp,
            this.credentials.accessToken,
            this.credentials.shopId
        );

        return {
            partner_id: this.credentials.partnerId,
            timestamp,
            access_token: this.credentials.accessToken,
            shop_id: this.credentials.shopId,
            sign
        };
    }

    private async buscarOrderSn(params: BuscarPedidosShopeeParams) {
        const orderSns: string[] = [];
        let cursor = '';
        let more = true;

        while (more) {
            const timestamp = await this.obterTimestampShopee();
            const queryParams: Record<string, string | number> = {
                ...this.authParams(ORDER_LIST_PATH, timestamp),
                time_range_field: 'create_time',
                time_from: params.timeFrom,
                time_to: params.timeTo,
                page_size: MAX_PAGE_SIZE,
                cursor
            };

            if (params.orderStatus) {
                queryParams.order_status = params.orderStatus;
            }

            const response = await this.client.get<ShopeeOrderListResponse>(ORDER_LIST_PATH, {
                params: queryParams
            });

            if (response.data.error) {
                throw new Error(`Erro Shopee (lista): ${response.data.error} - ${response.data.message || 'sem detalhes'}`);
            }

            const orders = response.data.response?.order_list || [];
            orderSns.push(...orders.map((order) => order.order_sn));
            more = Boolean(response.data.response?.more);
            cursor = response.data.response?.next_cursor || '';

            if (!more) {
                break;
            }
        }

        return Array.from(new Set(orderSns));
    }

    private async buscarOrderSnEmJanelas(params: BuscarPedidosShopeeParams) {
        const orderSns = new Set<string>();
        let atual = params.timeFrom;
        const limiteFinal = params.timeTo;

        while (atual <= limiteFinal) {
            const fimJanela = Math.min(atual + MAX_TIME_RANGE_SECONDS, limiteFinal);
            const orderSnsJanela = await this.buscarOrderSn({
                timeFrom: atual,
                timeTo: fimJanela,
                orderStatus: params.orderStatus
            });

            orderSnsJanela.forEach((sn) => orderSns.add(sn));
            atual = fimJanela + 1;
        }

        return Array.from(orderSns);
    }

    private async buscarDetalhesPedidos(orderSns: string[]) {
        if (orderSns.length === 0) {
            return [];
        }

        const detalhes: ShopeeRawOrder[] = [];
        const lotes = dividirEmLotes(orderSns, DETAIL_BATCH_SIZE);

        for (const lote of lotes) {
            const timestamp = await this.obterTimestampShopee();
            const responseOptionalFields = 'item_list,total_amount,buyer_username,recipient_address,create_time,message_to_seller,ship_by_date,actual_shipping_fee,package_list,escrow_amount';
            const authParams = this.authParams(ORDER_DETAIL_PATH, timestamp);

            const response = await this.client.get<ShopeeOrderDetailResponse>(
                ORDER_DETAIL_PATH,
                {
                    params: {
                        ...authParams,
                        order_sn_list: lote.join(','),
                        response_optional_fields: responseOptionalFields
                    }
                }
            );

            if (response.data.error) {
                throw new Error(`Erro Shopee (detalhes): ${response.data.error} - ${response.data.message || 'sem detalhes'}`);
            }

            detalhes.push(...(response.data.response?.order_list || []));
        }

        return detalhes;
    }

    async buscarPedidos(params: BuscarPedidosShopeeParams) {
        const orderSns = await this.buscarOrderSnEmJanelas(params);
        const detalhes = await this.buscarDetalhesPedidos(orderSns);
        return detalhes
            .filter((order) => Boolean(order.order_sn))
            .map(mapearPedidoShopee);
    }

    private async buscarItensList() {
        const itemIds: number[] = [];
        let offset = 0;
        let hasNext = true;

        while (hasNext) {
            const timestamp = await this.obterTimestampShopee();
            const queryParams: Record<string, string | number> = {
                ...this.authParams('/api/v2/product/get_item_list', timestamp),
                offset,
                page_size: 50,
                item_status: 'NORMAL'
            };

            const response = await this.client.get<ShopeeItemListResponse>('/api/v2/product/get_item_list', {
                params: queryParams
            });

            if (response.data.error) {
                throw new Error(`Erro Shopee (get_item_list): ${response.data.error} - ${response.data.message}`);
            }

            const items = response.data.response?.item || [];
            itemIds.push(...items.map(i => i.item_id));

            hasNext = Boolean(response.data.response?.has_next_page);
            offset = response.data.response?.next_offset || (offset + 50);

            if (!hasNext || items.length === 0) break;
        }

        return Array.from(new Set(itemIds));
    }

    private async buscarItemBaseInfo(itemIds: number[]) {
        if (itemIds.length === 0) return [];
        const detalhes = [];
        const lotes = dividirEmLotes(itemIds, 50);

        for (const lote of lotes) {
            const timestamp = await this.obterTimestampShopee();
            const response = await this.client.get<ShopeeItemBaseInfoResponse>('/api/v2/product/get_item_base_info', {
                params: {
                    ...this.authParams('/api/v2/product/get_item_base_info', timestamp),
                    item_id_list: lote.join(',')
                }
            });

            if (response.data.error) {
                throw new Error(`Erro Shopee (get_item_base_info): ${response.data.error} - ${response.data.message}`);
            }

            detalhes.push(...(response.data.response?.item_list || []));
        }
        return detalhes;
    }

    private async buscarModelList(itemId: number) {
        const timestamp = await this.obterTimestampShopee();
        const response = await this.client.get<ShopeeModelListResponse>('/api/v2/product/get_model_list', {
            params: {
                ...this.authParams('/api/v2/product/get_model_list', timestamp),
                item_id: itemId
            }
        });

        if (response.data.error) {
            console.warn(`Erro ao buscar modelos do item ${itemId}: ${response.data.message}`);
            return null;
        }

        return response.data.response;
    }

    async sincronizarCatalogo(): Promise<ShopeeProdutoMapeado[]> {
        const itemIds = await this.buscarItensList();
        const baseInfos = await this.buscarItemBaseInfo(itemIds);

        const produtos: ShopeeProdutoMapeado[] = [];

        for (const info of baseInfos) {
            if (!info.has_model) {
                if (info.item_sku) {
                    produtos.push({
                        sku: String(info.item_sku).trim(),
                        nome: String(info.item_name).trim(),
                        preco: toNumber(info.price_info?.[0]?.original_price, 0)
                    });
                }
            } else {
                const modelInfo = await this.buscarModelList(info.item_id);
                if (modelInfo && modelInfo.model) {
                    for (const model of modelInfo.model) {
                        if (!model.model_sku) continue;
                        
                        let nomeVariacao = '';
                        if (model.tier_index && modelInfo.tier_variation) {
                            const opcoes = model.tier_index.map((idx, tierLevel) => {
                                const tier = modelInfo.tier_variation?.[tierLevel];
                                return tier?.option_list?.[idx]?.option || '';
                            }).filter(Boolean);
                            if (opcoes.length > 0) {
                                nomeVariacao = ` - ${opcoes.join(' ')}`;
                            }
                        }

                        produtos.push({
                            sku: String(model.model_sku).trim(),
                            nome: `${String(info.item_name).trim()}${nomeVariacao}`.substring(0, 200),
                            preco: toNumber(model.price_info?.[0]?.original_price, 0)
                        });
                    }
                }
            }
        }

        // Filtra duplicatas ou sem SKU
        const unicos = new Map<string, ShopeeProdutoMapeado>();
        for (const p of produtos) {
            if (p.sku && !unicos.has(p.sku.toUpperCase())) {
                unicos.set(p.sku.toUpperCase(), p);
            }
        }

        return Array.from(unicos.values());
    }
}

export async function buscarPedidosShopee(params: BuscarPedidosShopeeParams) {
    const credentials = await carregarCredenciaisShopee();
    const service = new ShopeeService(credentials);
    return service.buscarPedidos(params);
}

export async function buscarCatalogoShopee() {
    const credentials = await carregarCredenciaisShopee();
    const service = new ShopeeService(credentials);
    return service.sincronizarCatalogo();
}
