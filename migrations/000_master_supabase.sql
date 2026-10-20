-- Executar no SQL Editor como postgres, em um projeto novo.
-- Cria o schema final sem apagar dados. Nao executar 001..008 depois desta master.
-- Cadastrar o admin com hash scrypt via SQL privado ou ADMIN_INITIAL_USER/PASSWORD.
BEGIN;

CREATE SCHEMA IF NOT EXISTS vendas_de_bolo;
SET LOCAL search_path TO vendas_de_bolo, pg_catalog;

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nome_usuario VARCHAR(60) UNIQUE NOT NULL,
  senha_hash TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bolos (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  ingredientes TEXT[] NOT NULL DEFAULT '{}',
  categoria VARCHAR(50) NOT NULL DEFAULT 'comum',
  preco NUMERIC(10, 2) NOT NULL CHECK (preco >= 0),
  quantidade_disponivel INTEGER NOT NULL DEFAULT 0 CHECK (quantidade_disponivel >= 0),
  imagem_url TEXT NOT NULL DEFAULT '',
  imagem_dados BYTEA,
  imagem_tipo VARCHAR(30),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pedidos (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(24) UNIQUE NOT NULL,
  nome_cliente VARCHAR(120) NOT NULL,
  whatsapp_cliente VARCHAR(30) NOT NULL,
  bloco VARCHAR(30) NOT NULL,
  apartamento VARCHAR(30) NOT NULL,
  observacoes TEXT,
  forma_pagamento VARCHAR(20) NOT NULL DEFAULT 'credito',
  valor_total NUMERIC(10, 2) NOT NULL CHECK (valor_total >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'pendente',
  telegram_enviado BOOLEAN NOT NULL DEFAULT FALSE,
  telegram_erro TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS itens_pedido (
  id SERIAL PRIMARY KEY,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  bolo_id INTEGER NOT NULL REFERENCES bolos(id) ON DELETE RESTRICT,
  nome_bolo VARCHAR(150) NOT NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  preco_unitario NUMERIC(10, 2) NOT NULL CHECK (preco_unitario >= 0),
  subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0)
);

CREATE TABLE IF NOT EXISTS logs (
  id BIGSERIAL PRIMARY KEY,
  pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
  bolo_id INTEGER REFERENCES bolos(id) ON DELETE SET NULL,
  tipo VARCHAR(40) NOT NULL,
  descricao TEXT NOT NULL,
  quantidade_anterior INTEGER,
  quantidade_nova INTEGER,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tentativas_login (
  chave VARCHAR(64) PRIMARY KEY,
  tentativas INTEGER NOT NULL DEFAULT 0,
  bloqueado_ate TIMESTAMPTZ,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE bolos ADD COLUMN IF NOT EXISTS ingredientes TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE bolos ADD COLUMN IF NOT EXISTS imagem_dados BYTEA;
ALTER TABLE bolos ADD COLUMN IF NOT EXISTS imagem_tipo VARCHAR(30);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(20) NOT NULL DEFAULT 'credito';

ALTER TABLE bolos DROP CONSTRAINT IF EXISTS bolos_categoria_check;
ALTER TABLE bolos ADD CONSTRAINT bolos_categoria_check
  CHECK (categoria IN ('comum', 'com_cobertura', 'sobremesas'));

ALTER TABLE bolos DROP CONSTRAINT IF EXISTS bolos_imagem_tipo_check;
ALTER TABLE bolos ADD CONSTRAINT bolos_imagem_tipo_check
  CHECK (imagem_tipo IS NULL OR imagem_tipo IN ('image/png', 'image/jpeg', 'image/webp'));

ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_forma_pagamento_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_forma_pagamento_check
  CHECK (forma_pagamento IN ('pix', 'credito'));

CREATE INDEX IF NOT EXISTS idx_bolos_ativos ON bolos(ativo);
CREATE INDEX IF NOT EXISTS idx_bolos_quantidade ON bolos(quantidade_disponivel);
CREATE INDEX IF NOT EXISTS idx_pedidos_criado_em ON pedidos(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status);
CREATE INDEX IF NOT EXISTS idx_itens_pedido_pedido ON itens_pedido(pedido_id);
CREATE INDEX IF NOT EXISTS idx_logs_criado_em ON logs(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_logs_pedido ON logs(pedido_id);
CREATE INDEX IF NOT EXISTS idx_tentativas_login_atualizado_em ON tentativas_login(atualizado_em);

-- Uma unica linha, independentemente de nome ou status do administrador.
-- Se ja houver varios usuarios, aborta toda a transacao sem excluir nenhum.
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_admin_unico ON usuarios ((TRUE));

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE bolos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tentativas_login ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tabela TEXT;
BEGIN
  REVOKE ALL ON SCHEMA vendas_de_bolo FROM PUBLIC;
  REVOKE ALL ON ALL TABLES IN SCHEMA vendas_de_bolo FROM PUBLIC;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA vendas_de_bolo FROM PUBLIC;

  FOREACH tabela IN ARRAY ARRAY['usuarios', 'bolos', 'pedidos', 'itens_pedido', 'logs', 'tentativas_login']
  LOOP
    -- Restritiva: outra policy permissiva nao libera acesso direto por acidente.
    -- O backend conecta como postgres; a sessao do painel e validada na API.
    EXECUTE format('DROP POLICY IF EXISTS bloquear_acesso_direto ON vendas_de_bolo.%I', tabela);
    EXECUTE format(
      'CREATE POLICY bloquear_acesso_direto ON vendas_de_bolo.%I AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false)',
      tabela
    );
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA vendas_de_bolo FROM anon;
    REVOKE ALL ON ALL TABLES IN SCHEMA vendas_de_bolo FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA vendas_de_bolo FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA vendas_de_bolo FROM authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA vendas_de_bolo FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA vendas_de_bolo FROM authenticated;
  END IF;
END $$;

COMMIT;
