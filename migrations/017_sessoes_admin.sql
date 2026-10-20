BEGIN;

CREATE TABLE IF NOT EXISTS vendas_de_bolo.sessoes_admin (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  usuario_id integer NOT NULL REFERENCES vendas_de_bolo.usuarios(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_em timestamptz NOT NULL,
  CHECK (expira_em > criado_em)
);
CREATE INDEX IF NOT EXISTS idx_sessoes_admin_usuario ON vendas_de_bolo.sessoes_admin(usuario_id);
ALTER TABLE vendas_de_bolo.sessoes_admin ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vendas_de_bolo.sessoes_admin FROM PUBLIC;

CREATE OR REPLACE FUNCTION vendas_de_bolo.revogar_sessoes_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.senha_hash IS DISTINCT FROM OLD.senha_hash
    OR NEW.nome_usuario IS DISTINCT FROM OLD.nome_usuario
    OR NEW.ativo IS DISTINCT FROM OLD.ativo THEN
    DELETE FROM vendas_de_bolo.sessoes_admin WHERE usuario_id = OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS revogar_sessoes_admin ON vendas_de_bolo.usuarios;
CREATE TRIGGER revogar_sessoes_admin AFTER UPDATE ON vendas_de_bolo.usuarios
FOR EACH ROW EXECUTE FUNCTION vendas_de_bolo.revogar_sessoes_admin();

DO $$ BEGIN
  IF to_regprocedure('vendas_de_bolo.vendas_backend_v16(text,jsonb)') IS NULL THEN
    ALTER FUNCTION public.vendas_backend(text, jsonb) SET SCHEMA vendas_de_bolo;
    ALTER FUNCTION vendas_de_bolo.vendas_backend(text, jsonb) RENAME TO vendas_backend_v16;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.vendas_backend(p_operation text, p_data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  admin_id integer;
  result jsonb;
BEGIN
  CASE p_operation
  WHEN 'session_create' THEN
    SELECT id INTO admin_id FROM vendas_de_bolo.usuarios
      WHERE lower(nome_usuario) = lower(p_data->>'username') AND ativo
        AND senha_hash = p_data->>'credential_hash' FOR UPDATE;
    IF admin_id IS NULL THEN RETURN 'false'::jsonb; END IF;
    IF (p_data->>'ttl_seconds')::integer NOT BETWEEN 1 AND 28800 THEN
      RAISE EXCEPTION 'Invalid session lifetime';
    END IF;
    DELETE FROM vendas_de_bolo.sessoes_admin WHERE expira_em <= CURRENT_TIMESTAMP;
    INSERT INTO vendas_de_bolo.sessoes_admin(token_hash, usuario_id, expira_em)
      VALUES (p_data->>'token_hash', admin_id,
        CURRENT_TIMESTAMP + make_interval(secs => (p_data->>'ttl_seconds')::integer));
    RETURN 'true'::jsonb;
  WHEN 'session_valid' THEN
    RETURN to_jsonb(EXISTS (
      SELECT 1 FROM vendas_de_bolo.sessoes_admin s
      JOIN vendas_de_bolo.usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = p_data->>'token_hash' AND s.expira_em > CURRENT_TIMESTAMP
        AND u.ativo AND lower(u.nome_usuario) = lower(p_data->>'username')
    ));
  WHEN 'session_revoke' THEN
    DELETE FROM vendas_de_bolo.sessoes_admin WHERE token_hash = p_data->>'token_hash';
    RETURN 'true'::jsonb;
  ELSE
    result := vendas_de_bolo.vendas_backend_v16(p_operation, p_data);
    IF p_operation = 'health' THEN
      PERFORM 1 FROM vendas_de_bolo.sessoes_admin LIMIT 1;
      result := result || jsonb_build_object('version', 17);
    END IF;
    RETURN result;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION vendas_de_bolo.revogar_sessoes_admin(),
  vendas_de_bolo.vendas_backend_v16(text,jsonb), public.vendas_backend(text,jsonb) FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON vendas_de_bolo.sessoes_admin FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON FUNCTION vendas_de_bolo.revogar_sessoes_admin(), vendas_de_bolo.vendas_backend_v16(text,jsonb), public.vendas_backend(text,jsonb) FROM %I', role_name);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.vendas_backend(text,jsonb) TO service_role;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
