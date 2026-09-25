import * as fs from 'fs';
import * as path from 'path';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Client } from 'pg';

const secretsClient = new SecretsManagerClient({});

interface DbSecret {
  username: string;
  password: string;
}

async function getSecret(arn: string): Promise<DbSecret> {
  const res = await secretsClient.send(new GetSecretValueCommand({ SecretId: arn }));
  return JSON.parse(res.SecretString!);
}

export const handler = async () => {
  const host = process.env.DB_HOST!;
  const port = Number(process.env.DB_PORT || '5432');
  const dbName = process.env.DB_NAME!;
  const masterSecretArn = process.env.MASTER_SECRET_ARN!;
  const appSecretArn = process.env.APP_SECRET_ARN!;
  const appRole = process.env.APP_DB_ROLE!;

  const master = await getSecret(masterSecretArn);
  const app = await getSecret(appSecretArn);

  // 1. Conectar a la base por defecto ("postgres") como master y crear
  //    la base pedidos_cancha si no existe (CREATE DATABASE no admite IF NOT EXISTS).
  const adminClient = new Client({
    host,
    port,
    user: master.username,
    password: master.password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await adminClient.connect();
  try {
    const exists = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) {
      await adminClient.query(`CREATE DATABASE ${adminClient.escapeIdentifier(dbName)}`);
      console.log(`Base ${dbName} creada.`);
    } else {
      console.log(`Base ${dbName} ya existía.`);
    }

    const roleExists = await adminClient.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [appRole]);
    if (roleExists.rowCount === 0) {
      await adminClient.query(
        `CREATE ROLE ${adminClient.escapeIdentifier(appRole)} WITH LOGIN PASSWORD '${app.password.replace(/'/g, "''")}'`
      );
      console.log(`Rol ${appRole} creado.`);
    } else {
      await adminClient.query(
        `ALTER ROLE ${adminClient.escapeIdentifier(appRole)} WITH PASSWORD '${app.password.replace(/'/g, "''")}'`
      );
      console.log(`Rol ${appRole} ya existía, password sincronizado.`);
    }

    await adminClient.query(`GRANT ALL PRIVILEGES ON DATABASE ${adminClient.escapeIdentifier(dbName)} TO ${adminClient.escapeIdentifier(appRole)}`);
  } finally {
    await adminClient.end();
  }

  // 2. Conectar ya a pedidos_cancha (como master) para correr el schema y
  //    dejar los privilegios del rol de la app listos dentro de esa base.
  const dbClient = new Client({
    host,
    port,
    user: master.username,
    password: master.password,
    database: dbName,
    ssl: { rejectUnauthorized: false },
  });
  await dbClient.connect();
  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await dbClient.query(schemaSql);
    console.log('schema.sql aplicado.');

    await dbClient.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${dbClient.escapeIdentifier(appRole)}`);
    await dbClient.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${dbClient.escapeIdentifier(appRole)}`);
    await dbClient.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${dbClient.escapeIdentifier(appRole)}`);
    await dbClient.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO ${dbClient.escapeIdentifier(appRole)}`
    );
    await dbClient.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO ${dbClient.escapeIdentifier(appRole)}`
    );
    console.log(`Privilegios otorgados a ${appRole} sobre ${dbName}.`);
  } finally {
    await dbClient.end();
  }

  return { ok: true };
};
