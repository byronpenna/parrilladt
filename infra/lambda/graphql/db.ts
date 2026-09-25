import { Pool } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});
let pool: Pool | null = null;

async function getAppCredentials(): Promise<{ username: string; password: string }> {
  const res = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: process.env.APP_SECRET_ARN! })
  );
  return JSON.parse(res.SecretString!);
}

export async function getPool(): Promise<Pool> {
  if (pool) return pool;
  const creds = await getAppCredentials();
  pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: creds.username,
    password: creds.password,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });
  return pool;
}
