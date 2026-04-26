import { Request, Response } from 'express';
import pool from '../config/database';
import { registrarLog } from '../services/logService';

export const obterDREConsolidado = async (req: Request, res: Response) => {
    try {
        const { ano, mes, plataforma } = req.query as Record<string, string>;
        
        // Se não vier, assume o atual
        const anoBusca = ano ? Number(ano) : new Date().getFullYear();
        const mesBusca = mes ? Number(mes) : null; // Se mes for null, traz o consolidado do ano inteiro

        // 1. Buscar a Tabela Consolidada (Mês a Mês para o Ano selecionado)
        // Precisamos calcular Faturamento, Custos etc por mês, fazendo um JOIN massivo.
        // Como o MySQL pode ficar lento com GROUP BY em muitas tabelas de uma vez, 
        // vamos calcular no Node.js a partir de consultas mais simples e limpas.

        let filtroPlataforma = '';
        let paramsPlataforma: any[] = [];
        if (plataforma) {
            filtroPlataforma = ' AND p.PLATAFORMA_ORIGEM = ? ';
            paramsPlataforma.push(plataforma);
        }

        // --- A. DADOS DE VENDAS E CUSTOS OPERACIONAIS (PEDIDOS) ---
        const [pedidosRaw]: any = await pool.query(`
            SELECT 
                MONTH(p.DATA_PEDIDO) as mes_pedido,
                YEAR(p.DATA_PEDIDO) as ano_pedido,
                p.ID_PEDIDO,
                p.VALOR_TOTAL,
                p.PLATAFORMA_ORIGEM,
                DATE(p.DATA_PEDIDO) as data_exata
            FROM PEDIDO p
            WHERE YEAR(p.DATA_PEDIDO) = ? 
            ${mesBusca ? 'AND MONTH(p.DATA_PEDIDO) = ?' : ''}
            ${filtroPlataforma}
            AND p.STATUS_PEDIDO != 'CANCELADO'
        `, mesBusca ? [anoBusca, mesBusca, ...paramsPlataforma] : [anoBusca, ...paramsPlataforma]);

        // Se não houver pedidos e nenhum dado manual, retorna vazio amigável
        if (pedidosRaw.length === 0 && !mesBusca) {
            // ... continua o processamento para talvez mostrar as metas preenchidas mesmo sem vendas
        }

        // Coleta IDs para buscar os itens
        const idsPedidos = pedidosRaw.map((p: any) => p.ID_PEDIDO);
        let itensRaw: any[] = [];

        if (idsPedidos.length > 0) {
            const placeholders = idsPedidos.map(() => '?').join(',');
            const queryItens = `
                SELECT 
                    ip.ID_PEDIDO,
                    ip.QUANTIDADE,
                    ip.VALOR_UNITARIO,
                    pr.MAO_DE_OBRA_VALOR,
                    COALESCE((
                        SELECT SUM(ft.QTD_CONSUMO * mp.CUSTO_UNITARIO)
                        FROM FICHA_TECNICA ft
                        JOIN MATERIA_PRIMA mp ON ft.ID_MATERIA = mp.ID_MATERIA
                        WHERE ft.ID_PRODUTO = ip.ID_PRODUTO
                    ), 0) as CUSTO_MATERIAIS_UNITARIO
                FROM ITEM_PEDIDO ip
                JOIN PRODUTO pr ON ip.ID_PRODUTO = pr.ID_PRODUTO
                WHERE ip.ID_PEDIDO IN (${placeholders})
            `;
            const [resultadoItens] = await pool.query(queryItens, idsPedidos);
            itensRaw = resultadoItens as any[];
        }

        // --- B. DADOS FINANCEIROS MANUAIS (METAS, ADS, MÁQUINAS) ---
        const [dadosManuais]: any = await pool.query(`
            SELECT * FROM DADOS_FINANCEIROS_MENSAL 
            WHERE ANO = ? ${mesBusca ? 'AND MES = ?' : ''}
        `, mesBusca ? [anoBusca, mesBusca] : [anoBusca]);

        // --- C. PROCESSAMENTO DOS DADOS (Agrupando por Mês) ---
        // Cria um array de meses (1 a 12 se for o ano inteiro, ou apenas 1 mês se filtrado)
        const meses = mesBusca ? [mesBusca] : Array.from({length: 12}, (_, i) => i + 1);
        
        const tabelaConsolidada = meses.map(m => {
            const pedidosDoMes = pedidosRaw.filter((p: any) => p.mes_pedido === m);
            const idsDoMes = pedidosDoMes.map((p: any) => p.ID_PEDIDO);
            const itensDoMes = itensRaw.filter((i: any) => idsDoMes.includes(i.ID_PEDIDO));

            const qtdVendas = pedidosDoMes.length;
            const qtdProdutos = itensDoMes.reduce((acc: number, i: any) => acc + Number(i.QUANTIDADE), 0);
            const faturamento = pedidosDoMes.reduce((acc: number, p: any) => acc + Number(p.VALOR_TOTAL || 0), 0);
            
            const custoProducao = itensDoMes.reduce((acc: number, i: any) => acc + (Number(i.QUANTIDADE) * Number(i.CUSTO_MATERIAIS_UNITARIO)), 0);
            const custoMaoDeObra = itensDoMes.reduce((acc: number, i: any) => acc + (Number(i.QUANTIDADE) * Number(i.MAO_DE_OBRA_VALOR || 0)), 0);

            const manual = dadosManuais.find((d: any) => d.MES === m) || {
                META_FATURAMENTO: 0, INVESTIMENTO_ADS: 0, NOVAS_MAQUINAS: 0, CUSTO_NAO_PRODUTIVO: 0
            };

            const ads = Number(manual.INVESTIMENTO_ADS || 0);
            const maquinas = Number(manual.NOVAS_MAQUINAS || 0);
            const nProdutivo = Number(manual.CUSTO_NAO_PRODUTIVO || 0);
            const meta = Number(manual.META_FATURAMENTO || 0);

            const custoTotal = custoProducao + custoMaoDeObra + ads + maquinas + nProdutivo;
            const lucroLiquido = faturamento - custoTotal;
            const margemPercentual = faturamento > 0 ? (lucroLiquido / faturamento) * 100 : 0;

            return {
                mes: m,
                ano: anoBusca,
                qtdVendas,
                qtdProdutos,
                meta,
                faturamento,
                custoProducao,
                custoMaoDeObra,
                ads,
                maquinas,
                custoNaoProdutivo: nProdutivo,
                custoTotal,
                lucroLiquido,
                margemPercentual
            };
        });

        // --- D. INDICADORES GERAIS (Topo da Tela) ---
        // Se estiver filtrado por mês, mostra do mês. Se for por ano, mostra do ano.
        const faturamentoTotal = tabelaConsolidada.reduce((acc: number, m: any) => acc + m.faturamento, 0);
        const metaTotal = tabelaConsolidada.reduce((acc: number, m: any) => acc + m.meta, 0);
        const lucroTotal = tabelaConsolidada.reduce((acc: number, m: any) => acc + m.lucroLiquido, 0);
        const custosTotais = tabelaConsolidada.reduce((acc: number, m: any) => acc + m.custoTotal, 0);

        // Faturamento do Dia Atual
        const hojeDate = new Date().toISOString().split('T')[0];
        const pedidosHoje = pedidosRaw.filter((p: any) => new Date(p.data_exata).toISOString().split('T')[0] === hojeDate);
        const faturamentoHoje = pedidosHoje.reduce((acc: number, p: any) => acc + Number(p.VALOR_TOTAL || 0), 0);

        // Comparativo Mês Anterior (Crescimento %)
        let crescimentoPercentual = 0;
        if (mesBusca) {
            // Precisa buscar o faturamento do mês anterior
            let mesAnterior = mesBusca - 1;
            let anoAnterior = anoBusca;
            if (mesAnterior === 0) { mesAnterior = 12; anoAnterior--; }

            const [pedidosAnt]: any = await pool.query(`
                SELECT SUM(VALOR_TOTAL) as total
                FROM PEDIDO
                WHERE YEAR(DATA_PEDIDO) = ? AND MONTH(DATA_PEDIDO) = ? AND STATUS_PEDIDO != 'CANCELADO'
                ${filtroPlataforma}
            `, paramsPlataforma.length > 0 ? [anoAnterior, mesAnterior, paramsPlataforma[0]] : [anoAnterior, mesAnterior]);
            
            const fatAnt = Number(pedidosAnt[0]?.total || 0);
            if (fatAnt > 0) {
                crescimentoPercentual = ((faturamentoTotal - fatAnt) / fatAnt) * 100;
            } else if (faturamentoTotal > 0) {
                crescimentoPercentual = 100; // Crescimento infinito se o anterior era 0
            }
        }

        // --- E. DADOS GRÁFICOS ---
        // Gráfico de Pizza (Plataformas)
        const faturamentoPlataforma = pedidosRaw.reduce((acc: any, p: any) => {
            const plat = p.PLATAFORMA_ORIGEM || 'Balcão';
            acc[plat] = (acc[plat] || 0) + Number(p.VALOR_TOTAL);
            return acc;
        }, {});
        
        const graficoPizza = Object.keys(faturamentoPlataforma).map(k => ({
            name: k,
            value: faturamentoPlataforma[k]
        }));

        // Gráfico de Linha (Evolução Diária) - Apenas se filtrado por Mês
        let graficoLinha: any[] = [];
        if (mesBusca) {
            const diasNoMes = new Date(anoBusca, mesBusca, 0).getDate();
            for (let d = 1; d <= diasNoMes; d++) {
                // Formato YYYY-MM-DD
                const dataStr = `${anoBusca}-${String(mesBusca).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const fatDia = pedidosRaw
                    .filter((p: any) => new Date(p.data_exata).toISOString().split('T')[0] === dataStr)
                    .reduce((acc: number, p: any) => acc + Number(p.VALOR_TOTAL), 0);
                
                graficoLinha.push({
                    dia: String(d),
                    dataCompleta: dataStr,
                    faturamento: fatDia
                });
            }
        }

        res.json({
            kpis: {
                faturamentoTotal,
                metaTotal,
                lucroTotal,
                custosTotais,
                faturamentoHoje,
                crescimentoPercentual
            },
            tabelaConsolidada,
            graficos: {
                pizza: graficoPizza,
                linha: graficoLinha
            }
        });

    } catch (error) {
        console.error("Erro ao processar DRE:", error);
        res.status(500).json({ mensagem: 'Erro interno ao processar o DRE' });
    }
};

export const salvarDadosFinanceirosMensais = async (req: Request, res: Response) => {
    const { mes, ano, meta_faturamento, investimento_ads, novas_maquinas, custo_nao_produtivo } = req.body;

    if (!mes || !ano) return res.status(400).json({ mensagem: "Mês e Ano são obrigatórios" });

    try {
        await pool.query(`
            INSERT INTO DADOS_FINANCEIROS_MENSAL 
            (MES, ANO, META_FATURAMENTO, INVESTIMENTO_ADS, NOVAS_MAQUINAS, CUSTO_NAO_PRODUTIVO)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            META_FATURAMENTO = VALUES(META_FATURAMENTO),
            INVESTIMENTO_ADS = VALUES(INVESTIMENTO_ADS),
            NOVAS_MAQUINAS = VALUES(NOVAS_MAQUINAS),
            CUSTO_NAO_PRODUTIVO = VALUES(CUSTO_NAO_PRODUTIVO)
        `, [
            mes, ano, 
            meta_faturamento || 0, 
            investimento_ads || 0, 
            novas_maquinas || 0, 
            custo_nao_produtivo || 0
        ]);

        await registrarLog('SISTEMA', 'ATUALIZAR_METAS_FINANCEIRAS', `Metas e Custos do mês ${mes}/${ano} atualizados.`);
        res.json({ mensagem: "Dados mensais salvos com sucesso!" });
    } catch (error) {
        console.error("Erro ao salvar DRE manual:", error);
        res.status(500).json({ mensagem: "Erro ao salvar dados financeiros" });
    }
};
