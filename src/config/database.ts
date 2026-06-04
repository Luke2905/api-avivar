import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

const envCandidates = [
  process.env.ENV_PATH,
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../.env')
].filter((value): value is string => Boolean(value));

let envPathUsado: string | null = null;
for (const candidate of envCandidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    envPathUsado = candidate;
    break;
  }
}

if (!envPathUsado) {
  dotenv.config();
}

// Se USE_LOCAL_DB for 'true', tenta carregar as configurações do .env.development
const useLocalDb = process.env.USE_LOCAL_DB === 'true';
let devEnvPathUsado: string | null = null;

if (useLocalDb) {
  const devEnvCandidates = [
    process.env.ENV_DEV_PATH,
    path.resolve(process.cwd(), '.env.development'),
    path.resolve(__dirname, '../../.env.development')
  ].filter((value): value is string => Boolean(value));

  for (const candidate of devEnvCandidates) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate, override: true });
      devEnvPathUsado = candidate;
      break;
    }
  }
}

const dbHost = process.env.DB_HOST || 'localhost';
const dbUser = process.env.DB_USER || 'root';
const dbPassword = process.env.DB_PASSWORD || '';
const dbDatabase = process.env.DB_DATABASE || '';
const dbPort = Number(process.env.DB_PORT) || 4000;
const dbSsl = process.env.DB_SSL !== 'false'; // Habilita SSL por padrão (necessário para TiDB), desabilita se definido como 'false'

const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_DATABASE'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.warn(
    `[DB] Variáveis ausentes (${missingEnv.join(', ')}). ` +
      `Usando fallback. .env carregado de: ${envPathUsado || '<não encontrado>'}` +
      (devEnvPathUsado ? ` e .env.development de: ${devEnvPathUsado}` : '')
  );
}

const poolConfig: mysql.PoolOptions = {
  host: dbHost,
  user: dbUser,
  password: dbPassword,
  database: dbDatabase,
  port: dbPort,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

if (dbSsl) {
  poolConfig.ssl = {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true
  };
}

const pool = mysql.createPool(poolConfig);

export async function testarConexao() {
  try {
    const connection = await pool.getConnection();
    console.log(`[DB] Conectado com sucesso em ${dbHost}:${dbPort} (${dbDatabase || 'sem DB'})`);
    connection.release();
  } catch (error: any) {
    console.error(`[DB] Falha ao conectar em ${dbHost}:${dbPort} (${dbDatabase || 'sem DB'})`);
    if (error?.code) {
      console.error(`[DB] Código: ${error.code}`);
    }

    const aggregateErrors = Array.isArray(error?.errors) ? error.errors : [];
    for (const e of aggregateErrors) {
      console.error(`[DB] Detalhe: ${e?.code || 'ERRO'} ${e?.address || ''}:${e?.port || ''}`.trim());
    }

    console.error(error);
  }
}

export default pool;
