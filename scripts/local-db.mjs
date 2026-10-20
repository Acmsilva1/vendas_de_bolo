import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = dotenv.parse(fs.readFileSync(path.join(root, 'local_db.env')));
const url = new URL(env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
  throw new Error('Este comando aceita somente o PostgreSQL local.');
}
if ((env.PGSCHEMA || 'vendas_de_bolo') !== 'vendas_de_bolo') {
  throw new Error('O schema local deve ser vendas_de_bolo para usar a master.');
}

const mode = process.argv[2] || 'status';
if (!['status', 'setup', 'sql'].includes(mode)) throw new Error('Use status, setup ou sql ARQUIVO.');
const client = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  const { rows: [server] } = await client.query(
    "SELECT current_setting('server_version_num')::int AS version, current_database() AS database, inet_server_addr() AS host, inet_server_port() AS port"
  );
  if (server.version < 170000 || server.version >= 180000) throw new Error('PostgreSQL 17 obrigatório.');
  if (!['127.0.0.1', '::1'].includes(server.host)) throw new Error('O servidor conectado não está em loopback.');
  if (mode === 'setup') {
    await client.query(fs.readFileSync(path.join(root, 'migrations/000_master_supabase.sql'), 'utf8'));
    const seed = path.join(root, 'migrations/009_admin_inicial.local.sql');
    if (fs.existsSync(seed)) {
      await client.query(fs.readFileSync(seed, 'utf8'));
      console.log('Administrador configurado pelo SQL privado local.');
    } else {
      console.log('Schema criado; configure o admin separadamente. O seed privado não acompanha o Git.');
    }
  }
  if (mode === 'sql') {
    if (!process.argv[3]) throw new Error('Informe o caminho do arquivo SQL.');
    const result = await client.query(fs.readFileSync(path.resolve(process.argv[3]), 'utf8'));
    for (const statement of Array.isArray(result) ? result : [result]) {
      console.log(JSON.stringify({ command: statement.command, rowCount: statement.rowCount, rows: statement.rows }));
    }
  }
  const tables = await client.query(
    "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'vendas_de_bolo' ORDER BY tablename"
  );
  console.log(JSON.stringify({ server, schema: 'vendas_de_bolo', tables: tables.rows }, null, 2));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
