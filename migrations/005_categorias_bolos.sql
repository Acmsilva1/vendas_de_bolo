SET search_path TO vendas_de_bolo;

UPDATE bolos
SET categoria = 'comum'
WHERE categoria IN ('tradicional', 'especial', 'gourmet');

ALTER TABLE bolos
  ALTER COLUMN categoria SET DEFAULT 'comum';

ALTER TABLE bolos
  DROP CONSTRAINT IF EXISTS bolos_categoria_check;

ALTER TABLE bolos
  ADD CONSTRAINT bolos_categoria_check
  CHECK (categoria IN ('comum', 'com_cobertura'));
