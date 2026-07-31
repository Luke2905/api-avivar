import { Request, Response } from 'express';
import pool from '../config/database';

export const getResumoFinanceiro = async (req: Request, res: Response) => {
  try {
    const [faturamento]: any = await pool.query(`
      SELECT SUM(VALOR_TOTAL) as total, SUM(VALOR_REPASSE) as repasse FROM PEDIDO WHERE STATUS_PEDIDO != 'CANCELADO'
    `);

    const [faturamentoDiario]: any = await pool.query(`
      SELECT SUM(VALOR_TOTAL) as total, SUM(VALOR_REPASSE) as repasse
      FROM PEDIDO
      WHERE STATUS_PEDIDO != 'CANCELADO'
        AND DATE(DATA_PEDIDO) = CURDATE()
    `);

    const [aReceber]: any = await pool.query(`
      SELECT SUM(VALOR_TOTAL) as total
      FROM PEDIDO
      WHERE STATUS_PEDIDO NOT IN ('CANCELADO', 'ENVIADO')
    `);

    const [despesasOps]: any = await pool.query(`
      SELECT SUM(VALOR) as total FROM DESPESA WHERE PAGO = 1
    `);

    const [despesasOpsDiarias]: any = await pool.query(`
      SELECT SUM(VALOR) as total
      FROM DESPESA
      WHERE PAGO = 1
        AND DATE(DATA_VENCIMENTO) = CURDATE()
    `);

    const [comprasMateria]: any = await pool.query(`
      SELECT SUM(CUSTO_TOTAL) as total FROM COMPRA
    `);

    const [comprasMateriaDiarias]: any = await pool.query(`
      SELECT SUM(CUSTO_TOTAL) as total
      FROM COMPRA
      WHERE DATE(DATA_COMPRA) = CURDATE()
    `);

    const [contasPagar]: any = await pool.query(`
      SELECT SUM(VALOR) as total FROM DESPESA WHERE PAGO = 0
    `);

    const [numeroPedidos]: any = await pool.query(`
      SELECT COUNT(*) as total FROM PEDIDO WHERE STATUS_PEDIDO != 'CANCELADO'
    `);

    const [numeroPedidosDiario]: any = await pool.query(`
      SELECT COUNT(*) as total
      FROM PEDIDO
      WHERE STATUS_PEDIDO != 'CANCELADO'
        AND DATE(DATA_PEDIDO) = CURDATE()
    `);

    const faturamentoTotalValor = Number(faturamento[0].total || 0);
    const faturamentoDiarioValor = Number(faturamentoDiario[0].total || 0);
    
    const repasseTotalValor = Number(faturamento[0].repasse || 0);
    const repasseDiarioValor = Number(faturamentoDiario[0].repasse || 0);
    const despesasPagasValor = Number(despesasOps[0].total || 0);
    const despesasPagasDiariasValor = Number(despesasOpsDiarias[0].total || 0);
    const comprasTotalValor = Number(comprasMateria[0].total || 0);
    const comprasDiariasValor = Number(comprasMateriaDiarias[0].total || 0);

    const totalSaidas = despesasPagasValor + comprasTotalValor;
    const totalSaidasDiarias = despesasPagasDiariasValor + comprasDiariasValor;

    const lucroBruto = repasseTotalValor - comprasTotalValor;
    const lucroBrutoDiario = repasseDiarioValor - comprasDiariasValor;
    const faturamentoLiquido = repasseTotalValor - totalSaidas;
    const faturamentoLiquidoDiario = repasseDiarioValor - totalSaidasDiarias;

    res.json({
      faturamento: faturamentoTotalValor,
      faturamento_diario: faturamentoDiarioValor,
      faturamento_liquido: faturamentoLiquido,
      faturamento_liquido_diario: faturamentoLiquidoDiario,
      a_receber: Number(aReceber[0].total || 0),
      despesas_pagas: totalSaidas,
      despesas_pagas_diario: totalSaidasDiarias,
      contas_a_pagar: Number(contasPagar[0].total || 0),
      lucro_estimado: faturamentoLiquido,
      lucro_bruto: lucroBruto,
      lucro_bruto_diario: lucroBrutoDiario,
      numero_pedidos: Number(numeroPedidos[0].total || 0),
      numero_pedidos_diario: Number(numeroPedidosDiario[0].total || 0)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensagem: 'Erro ao calcular financeiro.' });
  }
};

export const listarDespesas = async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT * FROM (
        SELECT
          ID_DESPESA as id,
          DESCRICAO as descricao,
          VALOR as valor,
          DATA_VENCIMENTO as data,
          CATEGORIA as categoria,
          PAGO as pago,
          'DESPESA' as tipo_origem
        FROM DESPESA

        UNION ALL

        SELECT
          c.ID_COMPRA as id,
          CONCAT('Compra: ', m.NOME_MATERIA, ' (', c.QTD_COMPRADA, ' un)') as descricao,
          c.CUSTO_TOTAL as valor,
          c.DATA_COMPRA as data,
          'MATERIA_PRIMA' as categoria,
          1 as pago,
          'COMPRA' as tipo_origem
        FROM COMPRA c
        JOIN MATERIA_PRIMA m ON c.ID_MATERIA = m.ID_MATERIA
      ) as extrato
      ORDER BY data DESC
      LIMIT 50
    `;

    const [rows] = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensagem: 'Erro ao listar extrato.' });
  }
};

export const criarDespesa = async (req: Request, res: Response) => {
  const { descricao, valor, categoria, data_vencimento, pago } = req.body;

  try {
    await pool.query(
      `INSERT INTO DESPESA (DESCRICAO, VALOR, CATEGORIA, DATA_VENCIMENTO, PAGO) VALUES (?, ?, ?, ?, ?)`,
      [descricao, valor, categoria, data_vencimento, pago ? 1 : 0]
    );

    res.status(201).json({ mensagem: 'Despesa registrada!' });
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro ao salvar despesa.' });
  }
};

export const atualizarDespesa = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { descricao, valor, categoria, data_vencimento, pago } = req.body;

  try {
    await pool.query(
      `UPDATE DESPESA SET DESCRICAO = ?, VALOR = ?, CATEGORIA = ?, DATA_VENCIMENTO = ?, PAGO = ? WHERE ID_DESPESA = ?`,
      [descricao, valor, categoria, data_vencimento, pago ? 1 : 0, id]
    );

    res.json({ mensagem: 'Despesa atualizada com sucesso!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensagem: 'Erro ao atualizar despesa.' });
  }
};

export const excluirDespesa = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM DESPESA WHERE ID_DESPESA = ?', [id]);
    res.json({ mensagem: 'Despesa excluída.' });
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro ao excluir despesa.' });
  }
};

export const toggleStatusDespesa = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { pago } = req.body;

  try {
    await pool.query('UPDATE DESPESA SET PAGO = ? WHERE ID_DESPESA = ?', [pago ? 1 : 0, id]);
    res.json({ mensagem: 'Status atualizado!' });
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro ao mudar status.' });
  }
};
