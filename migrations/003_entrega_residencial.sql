SET search_path TO vendas_de_bolo;

ALTER TABLE pedidos DROP COLUMN IF EXISTS tipo_entrega;
ALTER TABLE pedidos ALTER COLUMN endereco_entrega SET NOT NULL;
