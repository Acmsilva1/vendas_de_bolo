BEGIN;

DO $$ BEGIN
  IF to_regprocedure('vendas_de_bolo.vendas_backend_v17(text,jsonb)') IS NULL THEN
    ALTER FUNCTION public.vendas_backend(text, jsonb) SET SCHEMA vendas_de_bolo;
    ALTER FUNCTION vendas_de_bolo.vendas_backend(text, jsonb) RENAME TO vendas_backend_v17;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.vendas_backend(p_operation text, p_data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  admin_id integer;
  current_hash text;
  result jsonb;
BEGIN
  IF p_operation = 'password_change' THEN
    SELECT id, senha_hash INTO admin_id, current_hash FROM vendas_de_bolo.usuarios
      WHERE lower(nome_usuario) = lower(p_data->>'username') AND ativo FOR UPDATE;
    IF admin_id IS NULL OR current_hash IS DISTINCT FROM (p_data->>'credential_hash') THEN
      RETURN 'false'::jsonb;
    END IF;
    PERFORM 1 FROM vendas_de_bolo.sessoes_admin
      WHERE usuario_id = admin_id AND token_hash = p_data->>'token_hash'
        AND expira_em > clock_timestamp() FOR UPDATE;
    IF NOT FOUND THEN RETURN 'false'::jsonb; END IF;
    IF NOT coalesce((p_data->>'new_hash') ~ '^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$', false)
      OR p_data->>'new_hash' = current_hash THEN
      RAISE EXCEPTION 'Invalid credential hash';
    END IF;
    UPDATE vendas_de_bolo.usuarios SET senha_hash = p_data->>'new_hash', atualizado_em = CURRENT_TIMESTAMP
      WHERE id = admin_id;
    RETURN 'true'::jsonb;
  END IF;
  result := vendas_de_bolo.vendas_backend_v17(p_operation, p_data);
  IF p_operation = 'health' THEN result := result || jsonb_build_object('version', 18); END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION vendas_de_bolo.vendas_backend_v17(text,jsonb), public.vendas_backend(text,jsonb) FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION vendas_de_bolo.vendas_backend_v17(text,jsonb), public.vendas_backend(text,jsonb) FROM %I', role_name);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.vendas_backend(text,jsonb) TO service_role;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
