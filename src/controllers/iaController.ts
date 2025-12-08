// src/controllers/iaController.ts
import { Request, Response } from 'express';
import pool from '../config/database';

export const gerarPrevisoes = async (req: Request, res: Response) => {
    try {
        console.log("🤖 IA (Modo Estável): Calculando tendências...");

        // 1. Busca Histórico Total de Vendas por Produto
        const query = `
            SELECT 
                p.ID_PRODUTO, 
                p.NOME_PRODUTO, 
                p.SKU_PRODUTO,
                COALESCE(SUM(ip.QUANTIDADE), 0) as total_vendido_historico,
                DATEDIFF(NOW(), MIN(p2.DATA_PEDIDO)) as dias_desde_primeira_venda
            FROM PRODUTO p
            INNER JOIN ITEM_PEDIDO ip ON p.ID_PRODUTO = ip.ID_PRODUTO
            INNER JOIN PEDIDO p2 ON ip.ID_PEDIDO = p2.ID_PEDIDO 
            WHERE p2.STATUS_PEDIDO != 'CANCELADO'
            GROUP BY p.ID_PRODUTO
            HAVING total_vendido_historico > 0
            ORDER BY total_vendido_historico DESC
        `;

        const [vendas]: any = await pool.query(query);

        if (vendas.length === 0) {
            return res.json([]);
        }

        // 2. Algoritmo de Predição (Lógica Fixa e Conservadora)
        const predicoes = vendas.map((v: any) => {
            // Evita divisão por zero se a primeira venda foi hoje (assume 1 dia)
            const diasVendas = v.dias_desde_primeira_venda > 0 ? v.dias_desde_primeira_venda : 1;
            
            // Calcula a média real de vendas por dia
            const mediaDiaria = parseFloat(v.total_vendido_historico) / diasVendas;
            
            // Projeta para 30 dias (Mês Cheio)
            const mediaMensalAtual = Math.ceil(mediaDiaria * 30);

            // --- AQUI ESTÁ A MUDANÇA (ESTABILIDADE) ---
            // Em vez de aleatório, aplicamos uma Meta de Crescimento de 10% (1.10)
            // Isso cria uma meta saudável para o sistema perseguir
            const fatorCrescimento = 1.10; 
            
            const previsaoIA = Math.ceil(mediaMensalAtual * fatorCrescimento);
            
            // Análise de Tendência
            const diferenca = previsaoIA - mediaMensalAtual;
            
            let status = 'ESTAVEL';
            let sugestao = 'Vendas consistentes. Mantenha o fluxo.';

            // Como fixamos 10% de crescimento, a tendência será sempre positiva ou estável
            // Mas num cenário real, compararíamos com o mês anterior.
            if (mediaMensalAtual >= 10) {
                status = 'ALTA';
                sugestao = `Alta demanda! O sistema projeta vender ${previsaoIA} unidades. Prepare estoque.`;
            } else if (mediaMensalAtual < 3) {
                status = 'BAIXA';
                sugestao = 'Item com pouca saída. Avalie promoção.';
            }

            return {
                id: v.ID_PRODUTO,
                produto: v.NOME_PRODUTO,
                sku: v.SKU_PRODUTO,
                media_vendas_mes: mediaMensalAtual,
                previsao_ia: previsaoIA,
                tendencia: status,
                crescimento_pct: "10.0", // Fixo para projeção
                sugestao
            };
        });

        res.json(predicoes);

    } catch (error) {
        console.error("Erro IA:", error);
        res.status(500).json({ mensagem: 'Erro ao processar inteligência.' });
    }
};