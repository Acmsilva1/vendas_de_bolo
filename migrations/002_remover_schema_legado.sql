SET search_path TO vendas_de_bolo;

DO $$
DECLARE
    total_registros BIGINT := 0;
BEGIN
    IF to_regclass('vendas_de_bolo.cakes') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM vendas_de_bolo.cakes' INTO total_registros;
    END IF;
    IF to_regclass('vendas_de_bolo.orders') IS NOT NULL THEN
        EXECUTE 'SELECT ' || total_registros || ' + count(*) FROM vendas_de_bolo.orders' INTO total_registros;
    END IF;
    IF total_registros > 0 THEN
        RAISE EXCEPTION 'Migração interrompida: tabelas legadas possuem % registros.', total_registros;
    END IF;
END $$;

DROP TABLE IF EXISTS inventory_logs;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS cakes;
DROP TABLE IF EXISTS app_settings;
