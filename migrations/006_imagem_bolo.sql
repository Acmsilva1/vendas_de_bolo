SET search_path TO vendas_de_bolo;

ALTER TABLE bolos
  ADD COLUMN IF NOT EXISTS imagem_dados BYTEA,
  ADD COLUMN IF NOT EXISTS imagem_tipo VARCHAR(30);

ALTER TABLE bolos
  DROP CONSTRAINT IF EXISTS bolos_imagem_tipo_check;

ALTER TABLE bolos
  ADD CONSTRAINT bolos_imagem_tipo_check
  CHECK (imagem_tipo IS NULL OR imagem_tipo IN ('image/png', 'image/jpeg', 'image/webp'));
