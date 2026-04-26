# api-avivar

## Integração Shopee (pedidos)

Foi adicionada uma rota para sincronizar pedidos da Shopee com o banco:

- `POST /api/pedidos/shopee/sincronizar` (rota protegida por JWT)

### Body opcional

```json
{
  "dias": 7,
  "status": "READY_TO_SHIP",
  "data_inicio": "2026-04-01T00:00:00Z",
  "data_fim": "2026-04-03T23:59:59Z"
}
```

- Se `data_inicio` e `data_fim` forem enviados, eles têm prioridade.
- Se não forem enviados, a API usa `dias` (padrão `7`).

### Variáveis necessárias no `.env`

```env
SHOPEE_PARTNER_ID=123456
SHOPEE_SHOP_ID=987654
SHOPEE_ACCESS_TOKEN=token_da_loja
SHOPEE_PARTNER_KEY=partner_key_opcional
SHOPEE_API_KEY_FILE=api_key_shopee.txt
SHOPEE_BASE_URL=https://partner.shopeemobile.com
```

Observações:

- A chave pode vir de `SHOPEE_PARTNER_KEY` ou do arquivo `api_key_shopee.txt`.
- O import mapeia itens por SKU (`model_sku`/`item_sku`) para `PRODUTO.SKU_PRODUTO`.
- Pedidos já existentes (`PLATAFORMA_ORIGEM = 'Shopee'` + mesmo número de pedido) são ignorados.
