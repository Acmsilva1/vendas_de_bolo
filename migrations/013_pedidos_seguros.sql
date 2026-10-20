-- Executar como postgres APOS a 012, antes do deploy do backend atualizado.
-- Acrescenta metadados de idempotencia; preserva pedidos e dados existentes.
BEGIN;
ALTER TABLE vendas_de_bolo.pedidos ADD COLUMN IF NOT EXISTS idempotencia_chave VARCHAR(128);
ALTER TABLE vendas_de_bolo.pedidos ADD COLUMN IF NOT EXISTS idempotencia_hash VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_idempotencia
  ON vendas_de_bolo.pedidos(idempotencia_chave) WHERE idempotencia_chave IS NOT NULL;

DO $$
BEGIN
  IF to_regprocedure('vendas_de_bolo.vendas_backend_base(text,jsonb)') IS NULL THEN
    ALTER FUNCTION public.vendas_backend(text, jsonb) SET SCHEMA vendas_de_bolo;
    ALTER FUNCTION vendas_de_bolo.vendas_backend(text, jsonb) RENAME TO vendas_backend_base;
  END IF;
END $$;
REVOKE ALL ON FUNCTION vendas_de_bolo.vendas_backend_base(text, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.vendas_backend(p_operation text, p_data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  existing vendas_de_bolo.pedidos;
  result jsonb;
  attempts integer;
  entry jsonb;
  amount numeric;
BEGIN
  IF p_operation = 'health' THEN
    PERFORM idempotencia_chave, idempotencia_hash FROM vendas_de_bolo.pedidos LIMIT 1;
    PERFORM 1 FROM vendas_de_bolo.vendas_backend_base('health', '{}'::jsonb);
    RETURN jsonb_build_object('ok', true, 'version', 13);
  END IF;
  IF p_operation <> 'order_create' THEN
    RETURN vendas_de_bolo.vendas_backend_base(p_operation, p_data);
  END IF;
  IF COALESCE(p_data->>'idempotency_key', '') !~ '^[A-Za-z0-9_-]{16,128}$'
    OR COALESCE(p_data->>'request_hash', '') !~ '^[a-f0-9]{64}$'
    OR COALESCE(p_data->>'rate_key', '') !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('order', NULL, 'success', false, 'statusCode', 400, 'error', 'Pedido inválido.');
  END IF;
  result := jsonb_build_object('order', NULL, 'success', false, 'statusCode', 400, 'error', 'Itens inválidos.');
  IF jsonb_typeof(p_data->'items') IS DISTINCT FROM 'array' THEN RETURN result; END IF;
  IF jsonb_array_length(p_data->'items') NOT BETWEEN 1 AND 100 THEN RETURN result; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_data->'items') LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'object'
      OR jsonb_typeof(entry->'cake_id') IS DISTINCT FROM 'number'
      OR jsonb_typeof(entry->'quantity') IS DISTINCT FROM 'number'
      OR COALESCE(entry->>'cake_id', '') !~ '^[1-9][0-9]{0,9}$'
      OR COALESCE(entry->>'quantity', '') !~ '^[1-9][0-9]{0,6}$' THEN RETURN result; END IF;
    IF (entry->>'cake_id')::numeric > 2147483647 OR (entry->>'quantity')::numeric > 1000000 THEN RETURN result; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_data->'items') i
    GROUP BY (i->>'cake_id')::integer HAVING sum((i->>'quantity')::integer) > 1000000) THEN RETURN result; END IF;
  -- Serializa repeticoes da mesma intencao, inclusive em instancias distintas.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_data->>'idempotency_key', 0));
  SELECT * INTO existing FROM vendas_de_bolo.pedidos WHERE idempotencia_chave = p_data->>'idempotency_key';
  IF FOUND THEN
    IF existing.idempotencia_hash IS DISTINCT FROM p_data->>'request_hash' THEN
      RETURN jsonb_build_object('order', NULL, 'success', false, 'statusCode', 409,
        'error', 'Esta chave já foi usada para outro pedido.');
    END IF;
    RETURN jsonb_build_object('order', vendas_de_bolo.order_json(existing), 'success', true, 'replayed', true);
  END IF;
  -- Janela fixa; o backend deriva a chave do IP com HMAC e nao aceita chave do cliente.
  INSERT INTO vendas_de_bolo.tentativas_login AS t(chave, tentativas) VALUES (p_data->>'rate_key', 1)
    ON CONFLICT (chave) DO UPDATE SET
      tentativas = CASE WHEN t.atualizado_em < CURRENT_TIMESTAMP - INTERVAL '15 minutes'
        THEN 1 ELSE LEAST(t.tentativas + 1, 21) END,
      atualizado_em = CASE WHEN t.atualizado_em < CURRENT_TIMESTAMP - INTERVAL '15 minutes'
        THEN CURRENT_TIMESTAMP ELSE t.atualizado_em END
    RETURNING tentativas INTO attempts;
  IF attempts > 20 THEN
    RETURN jsonb_build_object('order', NULL, 'success', false, 'statusCode', 429,
      'error', 'Limite de pedidos atingido. Aguarde 15 minutos.');
  END IF;
  -- Prices and totals use NUMERIC(10,2). Check with unbounded numeric BEFORE the base RPC.
  PERFORM b.id FROM vendas_de_bolo.bolos b WHERE b.id IN
    (SELECT (i->>'cake_id')::integer FROM jsonb_array_elements(p_data->'items') i)
    ORDER BY b.id FOR UPDATE;
  SELECT sum(b.preco * (i->>'quantity')::integer) INTO amount
    FROM jsonb_array_elements(p_data->'items') i
    JOIN vendas_de_bolo.bolos b ON b.id = (i->>'cake_id')::integer;
  IF amount > 99999999.99 THEN
    RETURN jsonb_build_object('order', NULL, 'success', false, 'statusCode', 400,
      'error', 'O valor do pedido ultrapassa o limite permitido.');
  END IF;
  result := vendas_de_bolo.vendas_backend_base('order_create', p_data);
  IF (result->>'success')::boolean THEN
    UPDATE vendas_de_bolo.pedidos SET idempotencia_chave = p_data->>'idempotency_key',
      idempotencia_hash = p_data->>'request_hash' WHERE id = (result->'order'->>'id')::integer;
  END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.vendas_backend(text, jsonb) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.vendas_backend(text, jsonb) FROM anon;
    REVOKE ALL ON FUNCTION vendas_de_bolo.vendas_backend_base(text, jsonb) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.vendas_backend(text, jsonb) FROM authenticated;
    REVOKE ALL ON FUNCTION vendas_de_bolo.vendas_backend_base(text, jsonb) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON FUNCTION vendas_de_bolo.vendas_backend_base(text, jsonb) FROM service_role;
    GRANT EXECUTE ON FUNCTION public.vendas_backend(text, jsonb) TO service_role;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
