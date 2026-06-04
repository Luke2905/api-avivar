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
        cursor?: string;
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

interface ShopeeRawOrder {
    order_sn: string;
    buyer_username?: string;
    recipient_address?: {
        name?: string;
    };
    total_amount?: number;
    create_time?: number;
    item_list?: ShopeeRawOrderItem[];
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
    dataPedido: Date;
    itens: ShopeeOrderItem[];
}

export interface BuscarPedidosShopeeParams {
    timeFrom: number;
    timeTo: number;
    orderStatus?: string;
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

    const accessToken = String(cfg.ACCESS_TOKEN || process.env.SHOPEE_ACCESS_TOKEN || '').trim();
    const partnerKeyFile = process.env.SHOPEE_API_KEY_FILE || path.resolve(process.cwd(), 'api_key_shopee.txt');
    const partnerKeyFromFile = parsePartnerKeyFromFile(partnerKeyFile);
    const partnerKeyFromEnv = String(process.env.SHOPEE_PARTNER_KEY || process.env.TEST_API_PARTNER_KEY || '').trim();
    const partnerKey = String(cfg.PARTNER_KEY || '').trim() || partnerKeyFromEnv || String(partnerKeyFromFile || '').trim();
    const baseUrl = (cfg.SHOPEE_HOST || process.env.SHOPEE_HOST || DEFAULT_BASE_URL).replace(/\/$/, '');

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
    const createTime = toNumber(rawOrder.create_time, Math.floor(Date.now() / 1000));
    const nomeCliente = String(
        rawOrder.buyer_username || rawOrder.recipient_address?.name || 'Cliente Shopee'
    ).trim() || 'Cliente Shopee';

    return {
        orderSn: rawOrder.order_sn,
        nomeCliente,
        valorTotal,
        dataPedido: new Date(createTime * 1000),
        itens
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
            cursor = response.data.response?.cursor || '';

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
            const responseOptionalFields = 'item_list,total_amount,buyer_username,recipient_address,create_time';
            const authParams = this.authParams(ORDER_DETAIL_PATH, timestamp);

            try {
                const response = await this.client.post<ShopeeOrderDetailResponse>(
                    ORDER_DETAIL_PATH,
                    {
                        order_sn_list: lote,
                        response_optional_fields: responseOptionalFields
                    },
                    {
                        params: authParams
                    }
                );

                if (response.data.error) {
                    throw new Error(`Erro Shopee (detalhes): ${response.data.error} - ${response.data.message || 'sem detalhes'}`);
                }

                detalhes.push(...(response.data.response?.order_list || []));
            } catch (postError: any) {
                const fallbackResponse = await this.client.get<ShopeeOrderDetailResponse>(
                    ORDER_DETAIL_PATH,
                    {
                        params: {
                            ...authParams,
                            order_sn_list: lote.join(','),
                            response_optional_fields: responseOptionalFields
                        }
                    }
                );

                if (fallbackResponse.data.error) {
                    throw new Error(`Erro Shopee (detalhes): ${fallbackResponse.data.error} - ${fallbackResponse.data.message || 'sem detalhes'}`);
                }

                detalhes.push(...(fallbackResponse.data.response?.order_list || []));
            }
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
}

export async function buscarPedidosShopee(params: BuscarPedidosShopeeParams) {
    const credentials = await carregarCredenciaisShopee();
    const service = new ShopeeService(credentials);
    return service.buscarPedidos(params);
}
