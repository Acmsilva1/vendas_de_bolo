-- Executar apos 014. Fechar a loja nao altera o cadastro nem o estoque fisico.
BEGIN;

CREATE TABLE IF NOT EXISTS vendas_de_bolo.configuracao_loja (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  aberta boolean NOT NULL DEFAULT true,
  atualizado_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO vendas_de_bolo.configuracao_loja(id) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE vendas_de_bolo.configuracao_loja ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vendas_de_bolo.configuracao_loja FROM PUBLIC;

DO $$ BEGIN
  IF to_regprocedure('vendas_de_bolo.vendas_backend_v14(text,jsonb)') IS NULL THEN
    ALTER FUNCTION public.vendas_backend(text, jsonb) SET SCHEMA vendas_de_bolo;
    ALTER FUNCTION vendas_de_bolo.vendas_backend(text, jsonb) RENAME TO vendas_backend_v14;
  END IF;
END $$;
REVOKE ALL ON FUNCTION vendas_de_bolo.vendas_backend_v14(text, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.vendas_backend(p_operation text, p_data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  state vendas_de_bolo.configuracao_loja;
BEGIN
  IF p_operation = 'health' THEN
    PERFORM 1 FROM vendas_de_bolo.vendas_backend_v14('health', '{}');
    PERFORM 1 FROM vendas_de_bolo.configuracao_loja WHERE id;
    RETURN jsonb_build_object('ok', true, 'version', 15);
  END IF;

  IF p_operation = 'store_set' THEN
    IF jsonb_typeof(p_data->'is_open') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Estado da loja inválido.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO STRICT state FROM vendas_de_bolo.configuracao_loja WHERE id FOR UPDATE;
    IF state.aberta IS DISTINCT FROM (p_data->>'is_open')::boolean THEN
      UPDATE vendas_de_bolo.configuracao_loja SET aberta = (p_data->>'is_open')::boolean,
        atualizado_em = clock_timestamp() WHERE id RETURNING * INTO state;
      IF NOT state.aberta THEN
        UPDATE vendas_de_bolo.reservas_carrinho SET expira_em = clock_timestamp()
          WHERE expira_em > clock_timestamp();
      END IF;
    END IF;
    RETURN jsonb_build_object('is_open', state.aberta, 'updated_at', state.atualizado_em);
  END IF;

  IF p_operation = 'store_get' THEN
    SELECT * INTO STRICT state FROM vendas_de_bolo.configuracao_loja WHERE id;
    RETURN jsonb_build_object('is_open', state.aberta, 'updated_at', state.atualizado_em);
  END IF;

  IF p_operation IN ('cart_set', 'order_create') OR
    (p_operation IN ('cakes', 'cake') AND COALESCE((p_data->>'onlyActive')::boolean, false)) THEN
    -- Sempre loja -> carrinho -> produtos. Fechar espera as compras em andamento.
    SELECT * INTO STRICT state FROM vendas_de_bolo.configuracao_loja WHERE id FOR SHARE;
    IF NOT state.aberta THEN
      IF p_operation = 'cakes' THEN RETURN '[]'::jsonb; END IF;
      IF p_operation = 'cake' THEN RETURN NULL; END IF;
      -- A funcao anterior valida chave, token e hash antes de devolver o replay.
      IF p_operation = 'order_create' AND EXISTS (
        SELECT 1 FROM vendas_de_bolo.pedidos WHERE idempotencia_chave = p_data->>'idempotency_key'
      ) THEN
        RETURN vendas_de_bolo.vendas_backend_v14(p_operation, p_data);
      END IF;
      RETURN jsonb_build_object('success', false, 'order', NULL, 'statusCode', 409,
        'error', 'A loja está fechada no momento. Volte quando abrirmos novamente.',
        'cart', vendas_de_bolo.cart_snapshot(p_data->>'token_hash'));
    END IF;
  END IF;
  RETURN vendas_de_bolo.vendas_backend_v14(p_operation, p_data);
END;
$$;

REVOKE ALL ON FUNCTION public.vendas_backend(text, jsonb) FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON vendas_de_bolo.configuracao_loja FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON FUNCTION vendas_de_bolo.vendas_backend_v14(text,jsonb), public.vendas_backend(text,jsonb) FROM %I', role_name);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.vendas_backend(text, jsonb) TO service_role;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
