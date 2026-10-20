-- Remove apenas a descricao dos itens; descricoes dos logs sao preservadas.
-- Os valores existentes nesta coluna serao descartados.
BEGIN;
ALTER TABLE vendas_de_bolo.bolos DROP COLUMN IF EXISTS descricao;
COMMIT;
