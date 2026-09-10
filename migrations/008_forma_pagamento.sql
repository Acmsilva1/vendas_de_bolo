SET search_path TO vendas_de_bolo;

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(20) NOT NULL DEFAULT 'credito';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pedidos_forma_pagamento_check'
  ) THEN
    ALTER TABLE pedidos ADD CONSTRAINT pedidos_forma_pagamento_check
      CHECK (forma_pagamento IN ('pix', 'credito'));
  END IF;
END $$;
