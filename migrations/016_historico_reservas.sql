-- Executar apos 015. Historico por produto, sem alterar estoque ou locks da compra.
BEGIN;

CREATE TABLE IF NOT EXISTS vendas_de_bolo.registros_reservas (
  id bigserial PRIMARY KEY,
  token_hash text NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  bolo_id integer NOT NULL,
  nome_bolo text NOT NULL,
  quantidade integer NOT NULL CHECK (quantidade > 0),
  iniciado_em timestamptz,
  expira_em timestamptz NOT NULL,
  encerrado_em timestamptz,
  motivo_encerramento text CHECK (motivo_encerramento IN
    ('removida', 'comprada', 'expirada', 'loja_fechada', 'produto_excluido')),
  pedido_id integer,
  origem text NOT NULL CHECK (origem IN ('evento', 'migracao')),
  CHECK ((encerrado_em IS NULL) = (motivo_encerramento IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_registros_reservas_ciclo_aberto
  ON vendas_de_bolo.registros_reservas(token_hash, bolo_id) WHERE encerrado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_registros_reservas_produto ON vendas_de_bolo.registros_reservas(bolo_id, id);
ALTER TABLE vendas_de_bolo.registros_reservas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vendas_de_bolo.registros_reservas FROM PUBLIC;

CREATE OR REPLACE VIEW vendas_de_bolo.historico_reservas WITH (security_invoker = true) AS
  WITH moment AS MATERIALIZED (SELECT clock_timestamp() AS value)
  SELECT id, token_hash, bolo_id, nome_bolo, quantidade, iniciado_em, expira_em,
    COALESCE(encerrado_em, CASE WHEN expira_em <= moment.value THEN expira_em END) AS encerrado_em,
    COALESCE(motivo_encerramento, CASE WHEN expira_em <= moment.value THEN 'expirada' END) AS motivo_encerramento,
    pedido_id, origem,
    encerrado_em IS NULL AND expira_em > moment.value AS reserva_ativa
  FROM vendas_de_bolo.registros_reservas CROSS JOIN moment;

CREATE OR REPLACE FUNCTION vendas_de_bolo.registrar_ciclo_reserva()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  operation text := current_setting('vendas_de_bolo.audit_operation', true);
  event_time timestamptz := clock_timestamp();
  reason text;
  associated_order integer;
  cake_name text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF operation = 'order_create' THEN
      SELECT id INTO associated_order FROM vendas_de_bolo.pedidos
        WHERE idempotencia_chave = current_setting('vendas_de_bolo.audit_idempotency_key', true);
      IF associated_order IS NOT NULL THEN reason := 'comprada'; END IF;
    END IF;
    IF reason IS NULL THEN
      IF OLD.expira_em <= event_time THEN
        reason := 'expirada';
      ELSIF NOT EXISTS (SELECT 1 FROM vendas_de_bolo.bolos WHERE id = OLD.bolo_id) THEN
        reason := 'produto_excluido';
      ELSE
        reason := 'removida';
      END IF;
    END IF;
    UPDATE vendas_de_bolo.registros_reservas SET
      encerrado_em = CASE WHEN reason = 'expirada' THEN OLD.expira_em ELSE event_time END,
      motivo_encerramento = reason, pedido_id = associated_order
      WHERE token_hash = OLD.token_hash AND bolo_id = OLD.bolo_id AND encerrado_em IS NULL;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.expira_em <= event_time AND NEW.expira_em > OLD.expira_em THEN
      UPDATE vendas_de_bolo.registros_reservas SET encerrado_em = OLD.expira_em,
        motivo_encerramento = 'expirada'
        WHERE token_hash = OLD.token_hash AND bolo_id = OLD.bolo_id AND encerrado_em IS NULL;
    ELSE
      UPDATE vendas_de_bolo.registros_reservas SET quantidade = NEW.quantidade,
        expira_em = NEW.expira_em,
        encerrado_em = CASE WHEN NEW.expira_em <= event_time THEN
          CASE WHEN OLD.expira_em <= event_time THEN OLD.expira_em ELSE event_time END END,
        motivo_encerramento = CASE WHEN NEW.expira_em <= event_time THEN
          CASE WHEN OLD.expira_em <= event_time THEN 'expirada'
            WHEN operation = 'store_set' THEN 'loja_fechada' ELSE 'expirada' END END
        WHERE token_hash = OLD.token_hash AND bolo_id = OLD.bolo_id AND encerrado_em IS NULL;
      RETURN NEW;
    END IF;
  END IF;

  -- Uma linha fisica expirada pode ser renovada por UPSERT: novo ciclo, novo inicio.
  SELECT nome INTO cake_name FROM vendas_de_bolo.bolos WHERE id = NEW.bolo_id;
  INSERT INTO vendas_de_bolo.registros_reservas
    (token_hash, bolo_id, nome_bolo, quantidade, iniciado_em, expira_em, origem)
    VALUES (NEW.token_hash, NEW.bolo_id, COALESCE(cake_name, 'Produto excluido'),
      NEW.quantidade, event_time, NEW.expira_em, 'evento');
  RETURN NEW;
END;
$$;

-- Somente holds existentes: nao inventa inicio nem pedidos ou ciclos anteriores.
INSERT INTO vendas_de_bolo.registros_reservas
  (token_hash, bolo_id, nome_bolo, quantidade, iniciado_em, expira_em, origem)
SELECT r.token_hash, r.bolo_id, b.nome, r.quantidade, NULL, r.expira_em, 'migracao'
FROM vendas_de_bolo.reservas_carrinho r JOIN vendas_de_bolo.bolos b ON b.id = r.bolo_id
WHERE NOT EXISTS (SELECT 1 FROM vendas_de_bolo.registros_reservas h
  WHERE h.token_hash = r.token_hash AND h.bolo_id = r.bolo_id);

DROP TRIGGER IF EXISTS registrar_ciclo_reserva ON vendas_de_bolo.reservas_carrinho;
CREATE TRIGGER registrar_ciclo_reserva AFTER INSERT OR UPDATE OR DELETE
  ON vendas_de_bolo.reservas_carrinho FOR EACH ROW
  EXECUTE FUNCTION vendas_de_bolo.registrar_ciclo_reserva();

DO $$ BEGIN
  IF to_regprocedure('vendas_de_bolo.vendas_backend_v15(text,jsonb)') IS NULL THEN
    ALTER FUNCTION public.vendas_backend(text, jsonb) SET SCHEMA vendas_de_bolo;
    ALTER FUNCTION vendas_de_bolo.vendas_backend(text, jsonb) RENAME TO vendas_backend_v15;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.vendas_backend(p_operation text, p_data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  previous_operation text := COALESCE(current_setting('vendas_de_bolo.audit_operation', true), '');
  previous_key text := COALESCE(current_setting('vendas_de_bolo.audit_idempotency_key', true), '');
  result jsonb;
BEGIN
  PERFORM set_config('vendas_de_bolo.audit_operation', p_operation, true);
  PERFORM set_config('vendas_de_bolo.audit_idempotency_key', COALESCE(p_data->>'idempotency_key', ''), true);
  result := vendas_de_bolo.vendas_backend_v15(p_operation, p_data);
  IF p_operation = 'health' THEN
    PERFORM 1 FROM vendas_de_bolo.registros_reservas LIMIT 1;
    result := result || jsonb_build_object('version', 16);
  END IF;
  PERFORM set_config('vendas_de_bolo.audit_operation', previous_operation, true);
  PERFORM set_config('vendas_de_bolo.audit_idempotency_key', previous_key, true);
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('vendas_de_bolo.audit_operation', previous_operation, true);
  PERFORM set_config('vendas_de_bolo.audit_idempotency_key', previous_key, true);
  RAISE;
END;
$$;

REVOKE ALL ON vendas_de_bolo.historico_reservas FROM PUBLIC;
REVOKE ALL ON SEQUENCE vendas_de_bolo.registros_reservas_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION vendas_de_bolo.registrar_ciclo_reserva(),
  vendas_de_bolo.vendas_backend_v15(text,jsonb), public.vendas_backend(text,jsonb) FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON vendas_de_bolo.registros_reservas, vendas_de_bolo.historico_reservas FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON SEQUENCE vendas_de_bolo.registros_reservas_id_seq FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON FUNCTION vendas_de_bolo.registrar_ciclo_reserva(), vendas_de_bolo.vendas_backend_v15(text,jsonb), public.vendas_backend(text,jsonb) FROM %I', role_name);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.vendas_backend(text,jsonb) TO service_role;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
