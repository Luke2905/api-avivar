/**
 * withRetry — utilitário genérico de retry com backoff exponencial.
 *
 * Projetado para lidar com falhas transitórias de conexão ao TiDB (cold-start,
 * ECONNRESET, ETIMEDOUT) sem impactar erros de lógica de negócio.
 */

/** Códigos de erro de banco/rede que justificam uma nova tentativa */
const CODIGOS_RETENTAVEIS = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ER_CON_COUNT_ERROR',
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
]);

function erroRetentavel(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  if (typeof e.code === 'string' && CODIGOS_RETENTAVEIS.has(e.code)) return true;
  if (typeof e.message === 'string') {
    const msg = e.message.toLowerCase();
    if (msg.includes('connection') || msg.includes('connect') || msg.includes('timeout')) {
      return true;
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface WithRetryOptions {
  /** Número máximo de tentativas (padrão: 3) */
  tentativas?: number;
  /** Delay inicial em ms antes da 2ª tentativa (padrão: 5000) */
  delayInicial?: number;
  /** Fator de multiplicação do delay a cada tentativa (padrão: 2 → backoff exponencial) */
  fator?: number;
  /** Rótulo para identificar a operação nos logs */
  rotulo?: string;
}

/**
 * Executa `fn` com retry automático em caso de erros transitórios de conexão.
 *
 * Exemplo de uso:
 * ```ts
 * const resultado = await withRetry(
 *   () => pool.query('SELECT 1'),
 *   { rotulo: 'warm-up', tentativas: 3, delayInicial: 5000 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: WithRetryOptions = {}
): Promise<T> {
  const {
    tentativas = 3,
    delayInicial = 5_000,
    fator = 2,
    rotulo = 'operação',
  } = options;

  let ultimoErro: unknown;

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      return await fn();
    } catch (err) {
      ultimoErro = err;

      const ehRetentavel = erroRetentavel(err);
      const ultimaTentativa = tentativa === tentativas;

      if (ultimaTentativa || !ehRetentavel) {
        const motivo = !ehRetentavel ? 'erro não-retentável' : 'tentativas esgotadas';
        console.error(
          `[Retry] "${rotulo}" falhou (${motivo}, tentativa ${tentativa}/${tentativas}):`,
          err instanceof Error ? err.message : String(err)
        );
        throw err;
      }

      const espera = delayInicial * Math.pow(fator, tentativa - 1);
      console.warn(
        `[Retry] "${rotulo}" falhou na tentativa ${tentativa}/${tentativas}. ` +
        `Aguardando ${espera / 1000}s antes de tentar novamente...`
      );
      await sleep(espera);
    }
  }

  throw ultimoErro;
}
