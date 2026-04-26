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

const dbHost = process.env.DB_HOST || 'localhost';
const dbUser = process.env.DB_USER || 'root';
const dbPassword = process.env.DB_PASSWORD || '';
const dbDatabase = process.env.DB_DATABASE || '';
const dbPort = Number(process.env.DB_PORT) || 4000;

const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_DATABASE'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.warn(
    `[DB] Variáveis ausentes (${missingEnv.join(', ')}). ` +
      `Usando fallback. .env carregado de: ${envPathUsado || '<não encontrado>'}`
  );
}

const pool = mysql.createPool({
  host: dbHost,
  user: dbUser,
  password: dbPassword,
  database: dbDatabase,
  port: dbPort,
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

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
