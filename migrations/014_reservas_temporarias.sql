-- Executar APOS 012 e 013. Estoque fisico preservado; reservas expiram em 10 minutos.
BEGIN;
CREATE TABLE IF NOT EXISTS vendas_de_bolo.carrinhos_reserva (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  versao integer NOT NULL DEFAULT 0 CHECK (versao >= 0),
  atualizado_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS vendas_de_bolo.reservas_carrinho (
  token_hash text NOT NULL REFERENCES vendas_de_bolo.carrinhos_reserva(token_hash) ON DELETE CASCADE,
  bolo_id integer NOT NULL REFERENCES vendas_de_bolo.bolos(id) ON DELETE CASCADE,
  quantidade integer NOT NULL CHECK (quantidade BETWEEN 1 AND 1000000),
  expira_em timestamptz NOT NULL,
  PRIMARY KEY (token_hash, bolo_id)
);
CREATE INDEX IF NOT EXISTS idx_reservas_bolo_expira ON vendas_de_bolo.reservas_carrinho(bolo_id, expira_em);
CREATE INDEX IF NOT EXISTS idx_carrinhos_atualizado ON vendas_de_bolo.carrinhos_reserva(atualizado_em);
ALTER TABLE vendas_de_bolo.carrinhos_reserva ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendas_de_bolo.reservas_carrinho ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vendas_de_bolo.carrinhos_reserva, vendas_de_bolo.reservas_carrinho FROM PUBLIC;

CREATE OR REPLACE FUNCTION vendas_de_bolo.cake_available(c vendas_de_bolo.bolos, own_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SET search_path = '' AS $$
  SELECT vendas_de_bolo.cake_json(c) || jsonb_build_object('stock_quantity',
    greatest(0, c.quantidade_disponivel - COALESCE((
      SELECT sum(r.quantidade) FROM vendas_de_bolo.reservas_carrinho r
      WHERE r.bolo_id = c.id AND r.expira_em > clock_timestamp()
        AND (own_hash IS NULL OR r.token_hash <> own_hash)
    ), 0)))
$$;

CREATE OR REPLACE FUNCTION vendas_de_bolo.cart_snapshot(p_hash text)
RETURNS jsonb LANGUAGE sql VOLATILE SET search_path = '' AS $$
  SELECT jsonb_build_object('version', COALESCE((SELECT versao FROM vendas_de_bolo.carrinhos_reserva WHERE token_hash = p_hash), 0),
    'server_time', clock_timestamp(), 'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('cake', vendas_de_bolo.cake_available(b, p_hash),
        'quantity', r.quantidade, 'expires_at', r.expira_em,
        'status', CASE WHEN r.expira_em > clock_timestamp() AND b.ativo THEN 'active' ELSE 'expired' END) ORDER BY r.bolo_id)
      FROM vendas_de_bolo.reservas_carrinho r JOIN vendas_de_bolo.bolos b ON b.id = r.bolo_id
      WHERE r.token_hash = p_hash), '[]'::jsonb))
$$;

DO $$ BEGIN
  IF to_regprocedure('vendas_de_bolo.vendas_backend_v13(text,jsonb)') IS NULL THEN
    ALTER FUNCTION public.vendas_backend(text, jsonb) SET SCHEMA vendas_de_bolo;
    ALTER FUNCTION vendas_de_bolo.vendas_backend(text, jsonb) RENAME TO vendas_backend_v13;
  END IF;
END $$;
REVOKE ALL ON FUNCTION vendas_de_bolo.vendas_backend_v13(text, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.vendas_backend(p_operation text, p_data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  h text := p_data->>'token_hash';
  current_version integer;
  result jsonb;
  item jsonb;
  c vendas_de_bolo.bolos;
  hold vendas_de_bolo.reservas_carrinho;
  occupied bigint;
  quantity integer;
  attempts integer;
  next_stock integer;
  selected_items jsonb := '[]'::jsonb;
  moment timestamptz;
  existing vendas_de_bolo.pedidos;
BEGIN
  IF p_operation = 'health' THEN
    PERFORM 1 FROM vendas_de_bolo.carrinhos_reserva LIMIT 1;
    PERFORM 1 FROM vendas_de_bolo.vendas_backend_v13('health', '{}');
    RETURN jsonb_build_object('ok', true, 'version', 14);
  END IF;
  IF p_operation = 'cakes' AND COALESCE((p_data->>'onlyActive')::boolean, false) THEN
    SELECT COALESCE(jsonb_agg(vendas_de_bolo.cake_available(b) ORDER BY b.id), '[]'::jsonb)
      INTO result FROM vendas_de_bolo.bolos b WHERE b.ativo;
    RETURN result;
  END IF;
  IF p_operation = 'cake' AND COALESCE((p_data->>'onlyActive')::boolean, false) THEN
    SELECT vendas_de_bolo.cake_available(b) INTO result FROM vendas_de_bolo.bolos b
      WHERE b.id = (p_data->>'id')::integer AND b.ativo;
    RETURN result;
  END IF;
  IF p_operation IN ('stock', 'cake_update') THEN
    SELECT * INTO c FROM vendas_de_bolo.bolos WHERE id = (p_data->>'id')::integer FOR UPDATE;
    IF FOUND THEN
      next_stock := CASE WHEN p_operation = 'stock' THEN (p_data->>'newStock')::integer
        ELSE COALESCE((p_data->>'stock_quantity')::integer, c.quantidade_disponivel) END;
      SELECT COALESCE(sum(quantidade), 0) INTO occupied FROM vendas_de_bolo.reservas_carrinho
        WHERE bolo_id = c.id AND expira_em > clock_timestamp();
      IF next_stock < occupied THEN
        RETURN jsonb_build_object('reservation_conflict', true,
          'error', format('Há %s unidades reservadas. Aguarde a expiração antes de reduzir o estoque.', occupied));
      END IF;
    END IF;
    RETURN vendas_de_bolo.vendas_backend_v13(p_operation, p_data);
  END IF;
  IF p_operation NOT IN ('cart_get', 'cart_set', 'order_create') THEN
    RETURN vendas_de_bolo.vendas_backend_v13(p_operation, p_data);
  END IF;
  IF COALESCE(h, '') !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('success', false, 'statusCode', 400, 'error', 'Sacola inválida.');
  END IF;
  IF p_operation = 'cart_get' THEN
    RETURN jsonb_build_object('success', true, 'cart', vendas_de_bolo.cart_snapshot(h));
  END IF;
  IF COALESCE(p_data->>'expected_version', '') !~ '^[0-9]{1,9}$' THEN
    RETURN jsonb_build_object('success', false, 'statusCode', 400, 'error', 'Versão da sacola inválida.', 'cart', vendas_de_bolo.cart_snapshot(h));
  END IF;
  IF p_operation = 'cart_set' THEN
    moment := clock_timestamp();
  IF COALESCE(p_data->>'rate_key', '') !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('success', false, 'statusCode', 400, 'error', 'Solicitação inválida.', 'cart', vendas_de_bolo.cart_snapshot(h));
  END IF;
  INSERT INTO vendas_de_bolo.tentativas_login AS t(chave, tentativas) VALUES (p_data->>'rate_key', 1)
    ON CONFLICT (chave) DO UPDATE SET
      tentativas = CASE WHEN t.atualizado_em < moment - INTERVAL '15 minutes' THEN 1 ELSE LEAST(t.tentativas + 1, 121) END,
      atualizado_em = CASE WHEN t.atualizado_em < moment - INTERVAL '15 minutes' THEN moment ELSE t.atualizado_em END
    RETURNING tentativas INTO attempts;
  IF attempts > 120 THEN
    RETURN jsonb_build_object('success', false, 'statusCode', 429, 'error', 'Muitas alterações na sacola. Aguarde alguns minutos.', 'cart', vendas_de_bolo.cart_snapshot(h));
  END IF;
  END IF;
  IF p_operation = 'order_create' THEN
    IF COALESCE(p_data->>'idempotency_key', '') !~ '^[A-Za-z0-9_-]{16,128}$'
      OR COALESCE(p_data->>'request_hash', '') !~ '^[a-f0-9]{64}$' THEN
      RETURN jsonb_build_object('order', NULL, 'success', false, 'statusCode', 400, 'error', 'Pedido inválido.');
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_data->>'idempotency_key', 0));
    SELECT * INTO existing FROM vendas_de_bolo.pedidos WHERE idempotencia_chave = p_data->>'idempotency_key';
    IF FOUND THEN
      IF existing.idempotencia_hash IS DISTINCT FROM p_data->>'request_hash' THEN
        RETURN jsonb_build_object('order', NULL, 'success', false, 'statusCode', 409, 'error', 'Esta chave já foi usada para outro pedido.');
      END IF;
      RETURN jsonb_build_object('order', vendas_de_bolo.order_json(existing), 'success', true, 'replayed', true);
    END IF;
  END IF;
  INSERT INTO vendas_de_bolo.carrinhos_reserva(token_hash) VALUES (h) ON CONFLICT DO NOTHING;
  SELECT versao INTO current_version FROM vendas_de_bolo.carrinhos_reserva WHERE token_hash = h FOR UPDATE;
  IF current_version <> (p_data->>'expected_version')::integer THEN
    RETURN jsonb_build_object('success', false, 'order', NULL, 'statusCode', 409,
      'error', 'A sacola mudou em outra aba. Confira os itens e tente novamente.', 'cart', vendas_de_bolo.cart_snapshot(h));
  END IF;
  IF jsonb_typeof(p_data->'items') IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('success', false, 'statusCode', 400, 'error', 'Itens inválidos.', 'cart', vendas_de_bolo.cart_snapshot(h));
  END IF;
  IF jsonb_array_length(p_data->'items') > 100 THEN
    RETURN jsonb_build_object('success', false, 'statusCode', 400, 'error', 'Limite de itens excedido.', 'cart', vendas_de_bolo.cart_snapshot(h));
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_data->'items') LOOP
    IF jsonb_typeof(item->'cake_id') IS DISTINCT FROM 'number' OR jsonb_typeof(item->'quantity') IS DISTINCT FROM 'number'
      OR COALESCE(item->>'cake_id', '') !~ '^[1-9][0-9]{0,9}$' OR COALESCE(item->>'quantity', '') !~ '^[1-9][0-9]{0,6}$'
      OR (item->>'cake_id')::numeric > 2147483647 OR (item->>'quantity')::numeric > 1000000 THEN
      RETURN jsonb_build_object('success', false, 'statusCode', 400, 'error', 'Itens inválidos.', 'cart', vendas_de_bolo.cart_snapshot(h));
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_data->'items') i GROUP BY i->>'cake_id' HAVING count(*) > 1) THEN
    RETURN jsonb_build_object('success', false, 'statusCode', 400, 'error', 'Itens duplicados.', 'cart', vendas_de_bolo.cart_snapshot(h));
  END IF;
  -- Todos os fluxos bloqueiam bolos em ordem crescente. O relogio e conferido depois da espera.
  PERFORM b.id FROM vendas_de_bolo.bolos b WHERE b.id IN (
    SELECT (i->>'cake_id')::integer FROM jsonb_array_elements(p_data->'items') i
    UNION SELECT bolo_id FROM vendas_de_bolo.reservas_carrinho WHERE token_hash = h
  ) ORDER BY b.id FOR UPDATE;
  moment := clock_timestamp();
  IF p_operation = 'order_create' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(p_data->'items') LOOP
      SELECT * INTO hold FROM vendas_de_bolo.reservas_carrinho WHERE token_hash = h AND bolo_id = (item->>'cake_id')::integer;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'order', NULL, 'statusCode', 409, 'error', 'Produto sem reserva. Adicione-o novamente à sacola.');
      END IF;
      SELECT * INTO c FROM vendas_de_bolo.bolos WHERE id = hold.bolo_id;
      IF hold.expira_em <= moment OR NOT c.ativo THEN CONTINUE; END IF;
      IF hold.quantidade <> (item->>'quantity')::integer THEN
        RETURN jsonb_build_object('success', false, 'order', NULL, 'statusCode', 409, 'error', 'Quantidade diferente da reserva. Atualize a sacola.');
      END IF;
      selected_items := selected_items || jsonb_build_array(item);
    END LOOP;
    IF jsonb_array_length(selected_items) = 0 THEN
      RETURN jsonb_build_object('success', false, 'order', NULL, 'statusCode', 409, 'error', 'As reservas expiraram. Adicione os produtos novamente para comprar.', 'cart', vendas_de_bolo.cart_snapshot(h));
    END IF;
    result := vendas_de_bolo.vendas_backend_v13('order_create', p_data || jsonb_build_object('items', selected_items));
    IF COALESCE((result->>'success')::boolean, false) THEN
      DELETE FROM vendas_de_bolo.reservas_carrinho WHERE token_hash = h AND bolo_id IN (
        SELECT (i->>'cake_id')::integer FROM jsonb_array_elements(selected_items) i);
      UPDATE vendas_de_bolo.carrinhos_reserva SET versao = versao + 1, atualizado_em = clock_timestamp() WHERE token_hash = h;
    END IF;
    RETURN result || jsonb_build_object('cart', vendas_de_bolo.cart_snapshot(h));
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_data->'items') LOOP
    SELECT * INTO hold FROM vendas_de_bolo.reservas_carrinho WHERE token_hash = h AND bolo_id = (item->>'cake_id')::integer;
    IF FOUND AND hold.expira_em <= moment AND NOT COALESCE(p_data->'renew_ids', '[]'::jsonb) @> jsonb_build_array(hold.bolo_id) THEN CONTINUE; END IF;
    SELECT * INTO c FROM vendas_de_bolo.bolos WHERE id = (item->>'cake_id')::integer;
    IF NOT FOUND OR NOT c.ativo THEN
      RETURN jsonb_build_object('success', false, 'statusCode', 409, 'error', 'Produto indisponível.', 'cart', vendas_de_bolo.cart_snapshot(h));
    END IF;
    SELECT COALESCE(sum(quantidade), 0) INTO occupied FROM vendas_de_bolo.reservas_carrinho
      WHERE bolo_id = c.id AND token_hash <> h AND expira_em > moment;
    IF c.quantidade_disponivel - occupied < (item->>'quantity')::integer THEN
      RETURN jsonb_build_object('success', false, 'statusCode', 409, 'error', 'Estoque insuficiente para ' || c.nome || '. Disponível: ' || greatest(0, c.quantidade_disponivel - occupied) || '.', 'cart', vendas_de_bolo.cart_snapshot(h));
    END IF;
  END LOOP;
  DELETE FROM vendas_de_bolo.reservas_carrinho WHERE token_hash = h AND bolo_id NOT IN
    (SELECT (i->>'cake_id')::integer FROM jsonb_array_elements(p_data->'items') i);
  FOR item IN SELECT value FROM jsonb_array_elements(p_data->'items') LOOP
    SELECT * INTO hold FROM vendas_de_bolo.reservas_carrinho WHERE token_hash = h AND bolo_id = (item->>'cake_id')::integer;
    IF FOUND AND hold.expira_em <= moment AND NOT COALESCE(p_data->'renew_ids', '[]'::jsonb) @> jsonb_build_array(hold.bolo_id) THEN CONTINUE; END IF;
    INSERT INTO vendas_de_bolo.reservas_carrinho AS r(token_hash, bolo_id, quantidade, expira_em)
      VALUES (h, (item->>'cake_id')::integer, (item->>'quantity')::integer, moment + INTERVAL '10 minutes')
      ON CONFLICT (token_hash, bolo_id) DO UPDATE SET quantidade = excluded.quantidade,
        expira_em = CASE WHEN r.expira_em > moment THEN r.expira_em ELSE excluded.expira_em END;
  END LOOP;
  UPDATE vendas_de_bolo.carrinhos_reserva SET versao = versao + 1, atualizado_em = moment WHERE token_hash = h;
  RETURN jsonb_build_object('success', true, 'cart', vendas_de_bolo.cart_snapshot(h));
END;
$$;

REVOKE ALL ON FUNCTION vendas_de_bolo.cake_available(vendas_de_bolo.bolos, text), vendas_de_bolo.cart_snapshot(text), public.vendas_backend(text, jsonb) FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON vendas_de_bolo.carrinhos_reserva, vendas_de_bolo.reservas_carrinho FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON FUNCTION vendas_de_bolo.vendas_backend_v13(text,jsonb), vendas_de_bolo.cake_available(vendas_de_bolo.bolos,text), vendas_de_bolo.cart_snapshot(text) FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON FUNCTION public.vendas_backend(text,jsonb) FROM %I', role_name);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.vendas_backend(text, jsonb) TO service_role;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
