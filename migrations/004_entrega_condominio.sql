SET search_path TO vendas_de_bolo;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pedidos LIMIT 1) THEN
        RAISE EXCEPTION 'Migração interrompida: existem pedidos que precisam de conversão manual para bloco e apartamento.';
    END IF;
END $$;

ALTER TABLE pedidos DROP COLUMN IF EXISTS endereco_entrega;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS bloco VARCHAR(30) NOT NULL;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS apartamento VARCHAR(30) NOT NULL;
