// Server-only transport. Never import this module into web/.
export interface SupabaseConfig { url: string; key: string }

export function getSupabaseConfig(env: NodeJS.ProcessEnv = process.env): SupabaseConfig | null {
  const raw = (env.URL_SUPABASE || env.SUPABASE_URL || '').trim();
  if (!raw) return null;
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('URL_SUPABASE deve ser a URL HTTPS do projeto Supabase.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('URL_SUPABASE deve ser a URL HTTPS do projeto, sem caminhos ou credenciais.');
  }
  const key = (env.SERVICE_ROLE_SUPABASE || env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  let legacyRole = '';
  try { legacyRole = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch { /* not a legacy JWT */ }
  if (!key.startsWith('sb_secret_') && legacyRole !== 'service_role') {
    throw new Error('Configure SERVICE_ROLE_SUPABASE com a chave secreta do backend (secret ou service_role), nunca a anon key.');
  }
  return { url: url.origin, key };
}

export async function supabaseRpc<T>(config: SupabaseConfig, operation: string, data: unknown = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: config.key };
  // New secret keys are not JWTs; only legacy service_role keys use Bearer.
  if (!config.key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${config.key}`;
  let response: Response;
  try {
    response = await fetch(`${config.url}/rest/v1/rpc/vendas_backend`, {
      method: 'POST', headers,
      body: JSON.stringify({ p_operation: operation, p_data: data }),
      signal: AbortSignal.timeout(5000), redirect: 'error', cache: 'no-store'
    });
  } catch {
    throw new Error('Supabase HTTPS indisponível: falha de rede ou tempo limite.');
  }
  if (!response.ok) {
    // Do not propagate raw responses: they may contain customer data or credentials.
    if (response.status === 401 || response.status === 403) {
      throw new Error('Supabase HTTPS: chave secreta inválida ou sem permissão para vendas_backend.');
    }
    if (response.status === 404) {
      throw new Error('Supabase HTTPS: execute as migrations 012_supabase_https.sql, 013_pedidos_seguros.sql 014_reservas_temporarias.sql e 015_status_loja.sql no SQL Editor.');
    }
    throw new Error(`Supabase HTTPS: operação indisponível (HTTP ${response.status}). Confira a migration 012 e o schema.`);
  }
  try { return await response.json() as T; } catch {
    throw new Error('Supabase HTTPS retornou uma resposta inválida.');
  }
}
