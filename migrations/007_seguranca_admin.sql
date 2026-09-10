SET search_path TO vendas_de_bolo;

CREATE TABLE IF NOT EXISTS tentativas_login (
  chave VARCHAR(64) PRIMARY KEY,
  tentativas INTEGER NOT NULL DEFAULT 0,
  bloqueado_ate TIMESTAMP WITH TIME ZONE,
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tentativas_login_atualizado_em
  ON tentativas_login(atualizado_em);
