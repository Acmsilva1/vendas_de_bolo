BEGIN;
ALTER TABLE vendas_de_bolo.bolos DROP CONSTRAINT IF EXISTS bolos_categoria_check;
ALTER TABLE vendas_de_bolo.bolos ADD CONSTRAINT bolos_categoria_check
  CHECK (categoria IN ('comum', 'com_cobertura', 'sobremesas'));
COMMENT ON COLUMN vendas_de_bolo.bolos.categoria IS
  'comum: bolo comum; com_cobertura: cobertura avulsa em potinho (identificador legado); sobremesas: doces.';
COMMIT;
