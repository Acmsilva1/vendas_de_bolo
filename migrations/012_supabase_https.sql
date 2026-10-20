-- Execute como postgres no SQL Editor, depois da master (ou do schema existente).
-- Nao apaga tabelas/dados nem expoe o schema privado na Data API.
BEGIN;

CREATE OR REPLACE FUNCTION vendas_de_bolo.cake_json(c vendas_de_bolo.bolos)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'name', c.nome, 'ingredients', c.ingredientes,
    'category', c.categoria, 'price', c.preco, 'stock_quantity', c.quantidade_disponivel,
    'image_url', CASE WHEN c.imagem_dados IS NOT NULL
      THEN '/api/cakes/' || c.id || '/image?v=' || floor(extract(epoch FROM c.atualizado_em))::bigint
      ELSE c.imagem_url END,
    'is_active', c.ativo, 'created_at', c.criado_em, 'updated_at', c.atualizado_em
  );
$$;

CREATE OR REPLACE FUNCTION vendas_de_bolo.order_json(o vendas_de_bolo.pedidos)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', o.id, 'order_code', o.codigo, 'customer_name', o.nome_cliente,
    'customer_phone', o.whatsapp_cliente, 'delivery_block', o.bloco,
    'delivery_apartment', o.apartamento, 'notes', o.observacoes,
    'payment_method', o.forma_pagamento, 'total_amount', o.valor_total,
    'status', o.status, 'telegram_sent', o.telegram_enviado,
    'created_at', o.criado_em, 'updated_at', o.atualizado_em,
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', i.id, 'order_id', i.pedido_id, 'cake_id', i.bolo_id,
      'cake_name', i.nome_bolo, 'quantity', i.quantidade,
      'unit_price', i.preco_unitario, 'subtotal', i.subtotal
    ) ORDER BY i.id) FROM vendas_de_bolo.itens_pedido i WHERE i.pedido_id = o.id), '[]'::jsonb)
  );
$$;

-- Somente o backend com chave secreta pode chamar esta RPC.
-- Operacoes fixas; nenhum SQL ou identificador arbitrario e executado.
CREATE OR REPLACE FUNCTION public.vendas_backend(p_operation text, p_data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c vendas_de_bolo.bolos;
  o vendas_de_bolo.pedidos;
  item record;
  result jsonb;
  order_id integer;
  previous integer;
  next_stock integer;
  affected integer;
  total numeric(10,2) := 0;
  code text;
  period text;
  start_date timestamptz;
  end_date timestamptz;
  current_year integer;
BEGIN
  CASE p_operation
  WHEN 'health' THEN
    PERFORM 1 FROM vendas_de_bolo.usuarios LIMIT 1;
    PERFORM 1 FROM vendas_de_bolo.bolos LIMIT 1;
    PERFORM 1 FROM vendas_de_bolo.pedidos LIMIT 1;
    PERFORM 1 FROM vendas_de_bolo.itens_pedido LIMIT 1;
    PERFORM 1 FROM vendas_de_bolo.logs LIMIT 1;
    PERFORM 1 FROM vendas_de_bolo.tentativas_login LIMIT 1;
    RETURN jsonb_build_object('ok', true);
  WHEN 'ensure_admin' THEN
    INSERT INTO vendas_de_bolo.usuarios(nome_usuario, senha_hash)
      VALUES (p_data->>'username', p_data->>'hash') ON CONFLICT DO NOTHING;
    RETURN 'null'::jsonb;
  WHEN 'admin_hash' THEN
    SELECT to_jsonb(senha_hash) INTO result FROM vendas_de_bolo.usuarios
      WHERE lower(nome_usuario) = lower(p_data->>'username') AND ativo LIMIT 1;
    RETURN COALESCE(result, 'null'::jsonb);
  WHEN 'login_blocked' THEN
    SELECT to_jsonb(bloqueado_ate > CURRENT_TIMESTAMP) INTO result
      FROM vendas_de_bolo.tentativas_login WHERE chave = p_data->>'key';
    RETURN COALESCE(result, 'false'::jsonb);
  WHEN 'login_failure' THEN
    INSERT INTO vendas_de_bolo.tentativas_login AS t(chave, tentativas, bloqueado_ate)
      VALUES (p_data->>'key', 1, NULL)
      ON CONFLICT (chave) DO UPDATE SET
        tentativas = CASE WHEN t.atualizado_em < CURRENT_TIMESTAMP - INTERVAL '15 minutes'
          THEN 1 ELSE t.tentativas + 1 END,
        bloqueado_ate = CASE WHEN (CASE WHEN t.atualizado_em < CURRENT_TIMESTAMP - INTERVAL '15 minutes'
          THEN 1 ELSE t.tentativas + 1 END) >= (p_data->>'maxAttempts')::integer
          THEN CURRENT_TIMESTAMP + INTERVAL '15 minutes' ELSE NULL END,
        atualizado_em = CURRENT_TIMESTAMP;
    RETURN 'null'::jsonb;
  WHEN 'login_clear' THEN
    DELETE FROM vendas_de_bolo.tentativas_login WHERE chave = p_data->>'key';
    RETURN 'null'::jsonb;
  WHEN 'cakes' THEN
    SELECT COALESCE(jsonb_agg(vendas_de_bolo.cake_json(b) ORDER BY b.id), '[]'::jsonb)
      INTO result FROM vendas_de_bolo.bolos b
      WHERE NOT COALESCE((p_data->>'onlyActive')::boolean, false) OR b.ativo;
    RETURN result;
  WHEN 'cake' THEN
    SELECT * INTO c FROM vendas_de_bolo.bolos WHERE id = (p_data->>'id')::integer;
    IF NOT FOUND THEN RETURN 'null'::jsonb; END IF;
    RETURN vendas_de_bolo.cake_json(c);
  WHEN 'cake_image' THEN
    SELECT jsonb_build_object('hex', encode(imagem_dados, 'hex'), 'mimeType', imagem_tipo)
      INTO result FROM vendas_de_bolo.bolos WHERE id = (p_data->>'id')::integer AND imagem_dados IS NOT NULL;
    RETURN COALESCE(result, 'null'::jsonb);
  WHEN 'cake_create' THEN
    INSERT INTO vendas_de_bolo.bolos
      (nome, ingredientes, categoria, preco, quantidade_disponivel, imagem_url, ativo, imagem_dados, imagem_tipo)
      VALUES (p_data->>'name', ARRAY(SELECT jsonb_array_elements_text(p_data->'ingredients')),
        p_data->>'category', (p_data->>'price')::numeric, (p_data->>'stock_quantity')::integer,
        COALESCE(p_data->>'image_url', ''), (p_data->>'is_active')::boolean,
        decode(p_data->'image'->>'hex', 'hex'), p_data->'image'->>'mimeType') RETURNING * INTO c;
    RETURN vendas_de_bolo.cake_json(c);
  WHEN 'cake_update' THEN
    UPDATE vendas_de_bolo.bolos SET
      nome = COALESCE(p_data->>'name', nome),
      ingredientes = CASE WHEN p_data ? 'ingredients'
        THEN ARRAY(SELECT jsonb_array_elements_text(p_data->'ingredients')) ELSE ingredientes END,
      categoria = COALESCE(p_data->>'category', categoria),
      preco = COALESCE((p_data->>'price')::numeric, preco),
      quantidade_disponivel = COALESCE((p_data->>'stock_quantity')::integer, quantidade_disponivel),
      imagem_url = COALESCE(p_data->>'image_url', imagem_url),
      ativo = COALESCE((p_data->>'is_active')::boolean, ativo),
      imagem_dados = COALESCE(decode(p_data->'image'->>'hex', 'hex'), imagem_dados),
      imagem_tipo = COALESCE(p_data->'image'->>'mimeType', imagem_tipo),
      atualizado_em = CURRENT_TIMESTAMP
      WHERE id = (p_data->>'id')::integer RETURNING * INTO c;
    IF NOT FOUND THEN RETURN 'null'::jsonb; END IF;
    RETURN vendas_de_bolo.cake_json(c);
  WHEN 'stock' THEN
    SELECT * INTO c FROM vendas_de_bolo.bolos WHERE id = (p_data->>'id')::integer FOR UPDATE;
    IF NOT FOUND THEN RETURN 'null'::jsonb; END IF;
    previous := c.quantidade_disponivel;
    next_stock := greatest(0, floor((p_data->>'newStock')::numeric)::integer);
    UPDATE vendas_de_bolo.bolos SET quantidade_disponivel = next_stock, atualizado_em = CURRENT_TIMESTAMP
      WHERE id = c.id RETURNING * INTO c;
    INSERT INTO vendas_de_bolo.logs(bolo_id, tipo, descricao, quantidade_anterior, quantidade_nova)
      VALUES (c.id, p_data->>'reason', COALESCE(NULLIF(p_data->>'notes', ''), 'Estoque de ' || c.nome || ' atualizado'), previous, next_stock);
    RETURN vendas_de_bolo.cake_json(c);
  WHEN 'cake_delete' THEN
    UPDATE vendas_de_bolo.bolos SET ativo = false, atualizado_em = CURRENT_TIMESTAMP WHERE id = (p_data->>'id')::integer;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN to_jsonb(affected > 0);
  WHEN 'order_create' THEN
    IF jsonb_typeof(p_data->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'items') = 0 THEN
      RETURN jsonb_build_object('order', NULL, 'success', false, 'error', 'Item ou quantidade inválida.');
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_data->'items') i
      WHERE COALESCE(i->>'cake_id', '') !~ '^[0-9]+$'
        OR COALESCE(i->>'quantity', '') !~ '^[1-9][0-9]*$') THEN
      RETURN jsonb_build_object('order', NULL, 'success', false, 'error', 'Item ou quantidade inválida.');
    END IF;
    -- Bloqueia sempre na mesma ordem; todas as gravacoes pertencem a esta transacao RPC.
    PERFORM b.id FROM vendas_de_bolo.bolos b WHERE b.id IN
      (SELECT (i->>'cake_id')::integer FROM jsonb_array_elements(p_data->'items') i)
      ORDER BY b.id FOR UPDATE;
    FOR item IN SELECT (i->>'cake_id')::integer AS id, sum((i->>'quantity')::integer)::integer AS qty
      FROM jsonb_array_elements(p_data->'items') i GROUP BY 1 ORDER BY 1
    LOOP
      SELECT * INTO c FROM vendas_de_bolo.bolos WHERE id = item.id;
      IF NOT FOUND OR NOT c.ativo THEN
        RETURN jsonb_build_object('order', NULL, 'success', false, 'error', 'Item indisponível.');
      END IF;
      IF c.quantidade_disponivel < item.qty THEN
        RETURN jsonb_build_object('order', NULL, 'success', false, 'error',
          format('Estoque insuficiente para "%s". Disponíveis: %s.', c.nome, c.quantidade_disponivel));
      END IF;
      total := total + round(c.preco * item.qty, 2);
    END LOOP;
    code := 'DJU-' || upper(replace(gen_random_uuid()::text, '-', ''));
    code := left(code, 24);
    INSERT INTO vendas_de_bolo.pedidos
      (codigo, nome_cliente, whatsapp_cliente, bloco, apartamento, observacoes, valor_total, forma_pagamento, status)
      VALUES (code, p_data->>'customer_name', p_data->>'customer_phone', p_data->>'delivery_block',
        p_data->>'delivery_apartment', COALESCE(p_data->>'notes', ''), total, p_data->>'payment_method', 'pendente')
      RETURNING id INTO order_id;
    FOR item IN SELECT (i->>'cake_id')::integer AS id, sum((i->>'quantity')::integer)::integer AS qty
      FROM jsonb_array_elements(p_data->'items') i GROUP BY 1 ORDER BY 1
    LOOP
      SELECT * INTO c FROM vendas_de_bolo.bolos WHERE id = item.id;
      next_stock := c.quantidade_disponivel - item.qty;
      UPDATE vendas_de_bolo.bolos SET quantidade_disponivel = next_stock, atualizado_em = CURRENT_TIMESTAMP WHERE id = item.id;
      INSERT INTO vendas_de_bolo.itens_pedido(pedido_id, bolo_id, nome_bolo, quantidade, preco_unitario, subtotal)
        VALUES (order_id, c.id, c.nome, item.qty, c.preco, round(c.preco * item.qty, 2));
      INSERT INTO vendas_de_bolo.logs(pedido_id, bolo_id, tipo, descricao, quantidade_anterior, quantidade_nova)
        VALUES (order_id, c.id, 'venda', format('Reserva %s: %sx %s', code, item.qty, c.nome), c.quantidade_disponivel, next_stock);
    END LOOP;
    SELECT * INTO o FROM vendas_de_bolo.pedidos WHERE id = order_id;
    RETURN jsonb_build_object('order', vendas_de_bolo.order_json(o), 'success', true);
  WHEN 'telegram' THEN
    UPDATE vendas_de_bolo.pedidos SET telegram_enviado = (p_data->>'sent')::boolean,
      telegram_erro = NULLIF(p_data->>'errorMessage', ''), atualizado_em = CURRENT_TIMESTAMP
      WHERE id = (p_data->>'orderId')::integer;
    INSERT INTO vendas_de_bolo.logs(pedido_id, tipo, descricao)
      VALUES ((p_data->>'orderId')::integer,
        CASE WHEN (p_data->>'sent')::boolean THEN 'telegram_enviado' ELSE 'telegram_falhou' END,
        CASE WHEN (p_data->>'sent')::boolean THEN 'Notificação enviada ao Telegram.'
          ELSE 'Falha no Telegram: ' || left(p_data->>'errorMessage', 300) END);
    RETURN 'null'::jsonb;
  WHEN 'orders' THEN
    period := COALESCE(p_data->>'period', 'all');
    current_year := extract(year FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo');
    IF period = 'today' THEN
      start_date := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date AT TIME ZONE 'America/Sao_Paulo';
      end_date := start_date + INTERVAL '1 day';
    ELSIF period ~ '^month-([1-9]|1[0-2])$' THEN
      start_date := make_date(current_year, substring(period FROM 7)::integer, 1) AT TIME ZONE 'America/Sao_Paulo';
      end_date := ((start_date AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '1 month') AT TIME ZONE 'America/Sao_Paulo';
    END IF;
    SELECT COALESCE(jsonb_agg(vendas_de_bolo.order_json(p) ORDER BY p.criado_em DESC), '[]'::jsonb)
      INTO result FROM vendas_de_bolo.pedidos p
      WHERE (start_date IS NULL OR p.criado_em >= start_date) AND (end_date IS NULL OR p.criado_em < end_date);
    RETURN result;
  WHEN 'order_delete' THEN
    DELETE FROM vendas_de_bolo.pedidos WHERE id = (p_data->>'id')::integer;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN to_jsonb(affected > 0);
  WHEN 'order_status' THEN
    IF p_data->>'status' NOT IN ('pendente', 'confirmado', 'preparando', 'pronto', 'entregue', 'cancelado') THEN
      RAISE EXCEPTION 'Status invalido';
    END IF;
    UPDATE vendas_de_bolo.pedidos SET status = p_data->>'status', atualizado_em = CURRENT_TIMESTAMP
      WHERE id = (p_data->>'id')::integer RETURNING * INTO o;
    IF NOT FOUND THEN RETURN 'null'::jsonb; END IF;
    RETURN vendas_de_bolo.order_json(o);
  WHEN 'annual' THEN
    current_year := (p_data->>'year')::integer;
    SELECT jsonb_build_object('year', current_year,
      'months', (SELECT jsonb_agg(jsonb_build_object('month', m.month, 'total', COALESCE(s.total, 0), 'orders', COALESCE(s.orders, 0)) ORDER BY m.month)
        FROM generate_series(1, 12) m(month) LEFT JOIN (
          SELECT extract(month FROM p.criado_em)::integer AS month, sum(p.valor_total) AS total, count(*) AS orders
          FROM vendas_de_bolo.pedidos p WHERE p.criado_em >= make_date(current_year, 1, 1)
            AND p.criado_em < make_date(current_year + 1, 1, 1) GROUP BY 1
        ) s USING (month)),
      'topCakes', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (
        SELECT i.nome_bolo AS cake_name, sum(i.quantidade)::integer AS quantity, sum(i.subtotal) AS total
          FROM vendas_de_bolo.itens_pedido i JOIN vendas_de_bolo.pedidos p ON p.id = i.pedido_id
          WHERE p.criado_em >= make_date(current_year, 1, 1) AND p.criado_em < make_date(current_year + 1, 1, 1)
          GROUP BY i.nome_bolo ORDER BY quantity DESC, total DESC LIMIT 10
      ) t), '[]'::jsonb)) INTO result;
    RETURN result;
  ELSE
    RAISE EXCEPTION 'Operacao nao permitida';
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION vendas_de_bolo.cake_json(vendas_de_bolo.bolos) FROM PUBLIC;
REVOKE ALL ON FUNCTION vendas_de_bolo.order_json(vendas_de_bolo.pedidos) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vendas_backend(text, jsonb) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.vendas_backend(text, jsonb) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.vendas_backend(text, jsonb) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.vendas_backend(text, jsonb) TO service_role;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
