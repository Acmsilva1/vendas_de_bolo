CREATE SCHEMA IF NOT EXISTS vendas_de_bolo;
SET search_path TO vendas_de_bolo;

CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nome_usuario VARCHAR(60) UNIQUE NOT NULL,
    senha_hash TEXT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bolos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    descricao TEXT NOT NULL DEFAULT '',
    categoria VARCHAR(50) NOT NULL DEFAULT 'comum'
      CHECK (categoria IN ('comum', 'com_cobertura')),
    preco NUMERIC(10, 2) NOT NULL CHECK (preco >= 0),
    quantidade_disponivel INTEGER NOT NULL DEFAULT 0 CHECK (quantidade_disponivel >= 0),
    imagem_url TEXT NOT NULL DEFAULT '',
    imagem_dados BYTEA,
    imagem_tipo VARCHAR(30),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pedidos (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(24) UNIQUE NOT NULL,
    nome_cliente VARCHAR(120) NOT NULL,
    whatsapp_cliente VARCHAR(30) NOT NULL,
    bloco VARCHAR(30) NOT NULL,
    apartamento VARCHAR(30) NOT NULL,
    observacoes TEXT,
    valor_total NUMERIC(10, 2) NOT NULL CHECK (valor_total >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'pendente',
    telegram_enviado BOOLEAN NOT NULL DEFAULT FALSE,
    telegram_erro TEXT,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tentativas_login (
    chave VARCHAR(64) PRIMARY KEY,
    tentativas INTEGER NOT NULL DEFAULT 0,
    bloqueado_ate TIMESTAMP WITH TIME ZONE,
    atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bolos_ativos ON bolos(ativo);
CREATE INDEX IF NOT EXISTS idx_bolos_quantidade ON bolos(quantidade_disponivel);
CREATE INDEX IF NOT EXISTS idx_pedidos_criado_em ON pedidos(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status);
CREATE INDEX IF NOT EXISTS idx_itens_pedido_pedido ON itens_pedido(pedido_id);
CREATE INDEX IF NOT EXISTS idx_logs_criado_em ON logs(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_logs_pedido ON logs(pedido_id);
