# Documentação do Projeto: Delícias da Jú - Bolos Caseiros

Plataforma pública de catálogo e reservas para entrega dentro do condomínio, com controle de estoque e notificação interna pelo bot Telegram.

---

## 1. Visão Geral e Arquitetura

O projeto foi estruturado seguindo rigorosamente a separação de responsabilidades e as diretrizes do usuário André:
- **Backend (`/api`)**: API RESTful em Node.js com Express e PostgreSQL via pool de conexões (`pg`). Escritas persistentes são bloqueadas quando o banco está indisponível, evitando reservas falsas.
- **Frontend (`/web`)**: SPA em React com Tailwind CSS e Motion (`motion/react`) para catálogo responsivo, reservas residenciais e painel administrativo de estoque.
- **Migrations (`/migrations`)**: Scripts SQL DDL estruturados para PostgreSQL contendo tabelas, índices e restrições de integridade.
- **Documentação (`/docs`)**: Este documento único com especificação completa de stack, regras de segurança, conformidade com LGPD, manual de uso e checklist com checkpoint rastreável.

---

## 2. Stack Tecnológica

| Camada | Tecnologia | Detalhes |
|---|---|---|
| **Runtime & Servidor** | Node.js + Express | Servidor HTTP com validação, autenticação administrativa e persistência obrigatória para reservas |
| **Linguagem** | TypeScript (ES2022) | Tipagem estática rigorosa no backend e no frontend |
| **Frontend Framework** | React 19 + Vite | SPA de alta performance integrada ao Express via middleware do Vite |
| **Estilização** | Tailwind CSS v4 | Tema integralmente claro com pink como destaque, violeta suave e azul-bebê como cores de apoio |
| **Animações** | Motion (`motion/react`) | Transições de página, modais fluidos e microinterações de estoque |
| **Banco de Dados** | PostgreSQL 17 local (Docker) | Banco `db`, schema isolado `vendas_de_bolo`, conexão gerenciada com `pg.Pool` e migrations versionadas |
| **Notificação interna** | Telegram Bot API | Aviso automático ao administrador após a reserva, sem expor Telegram ao cliente |

---

## 3. Segurança e Conformidade com LGPD

1. **Minimização de Dados (LGPD art. 6º, III)**:
   - Os pedidos solicitam apenas nome, WhatsApp com DDD `27`, bloco, apartamento e observações opcionais.
   - Não são coletados nem armazenados dados sensíveis desnecessários (como CPF, dados de cartão ou dados biométricos).
2. **Controle de Acesso Backend**:
   - O catálogo e a criação de reservas são públicos e não exigem cadastro do cliente.
   - Cadastro de bolos, estoque, registros do dia, métricas e configurações exigem sessão administrativa Bearer validada no backend.
   - Existe somente o usuário `Admin`; a senha é armazenada com `scrypt`, salt aleatório e comparação resistente a timing attack.
   - A sessão é stateless, assinada por HMAC-SHA256 e entregue apenas em cookie `HttpOnly`, `SameSite=Strict` e `Secure` em produção; nenhum token fica disponível ao JavaScript.
   - O login possui limites persistentes por combinação IP/usuário e por conta, reduzindo força bruta local e distribuída. As chaves são HMACs e não armazenam o IP em texto puro.
   - Requisições administrativas de escrita e login validam a origem para reduzir CSRF; todas as permissões continuam sendo verificadas no backend.
3. **Prevenção contra Injeção e Sanitização**:
   - Queries ao PostgreSQL são estritamente parametrizadas (`$1, $2, ...`).
   - Strings recebidas de clientes e administradores sofrem sanitização e corte de comprimento máximo para evitar ataques de XSS e estouro de buffer.
4. **Proteção de Segredos**:
   - Chaves de bot de Telegram, credenciais de banco e senhas ficam isoladas em variáveis de ambiente no backend e nunca são expostas ao bundle do cliente.
5. **Upload de Imagens**:
   - Somente PNG, JPG e WebP reais são aceitos, com validação da assinatura binária e limite de 3 MB no frontend e no backend.
   - A imagem fica armazenada como `BYTEA` no PostgreSQL; o catálogo recebe apenas a URL controlada da API, sem expor o conteúdo binário no JSON dos bolos.
6. **Proteções HTTP**:
   - Em produção são aplicados HSTS e Content Security Policy; todas as respostas recebem proteção contra clickjacking, MIME sniffing e permissões desnecessárias do navegador.
   - `ADMIN_SESSION_SECRET` é obrigatório em produção, deve ter no mínimo 32 caracteres aleatórios e ficar marcado como segredo sensível na Vercel.

---

## 4. Estrutura de Diretórios

```text
/
├── api/
│   ├── db.ts               # Persistência PostgreSQL, transações de estoque e credenciais administrativas
│   ├── image.ts            # Validação de formato, assinatura binária e tamanho das imagens
│   ├── auth.ts             # Assinatura e validação stateless das sessões administrativas
│   ├── types.ts            # Tipos e interfaces compartilhadas do backend
│   └── index.ts            # Rotas da API REST (bolos, pedidos, estoque, configurações)
├── web/
│   ├── types.ts            # Tipos e contratos de dados do frontend
│   ├── components/
│   │   ├── Navbar.tsx      # Barra de navegação e troca de modo (Cliente / Admin)
│   │   ├── CakeCatalog.tsx # Catálogo com motion, cartões e estoque
│   │   ├── OrderModal.tsx  # Modal público de reserva e confirmação em tela
│   │   ├── AdminDashboard.tsx # Gestão de estoque, novos sabores e status de pedidos
│   │   └── Toast.tsx       # Notificações visuais elegantes
│   └── App.tsx             # Componente raiz do frontend
├── migrations/
│   ├── 001_initial_schema.sql # DDL brasileiro das tabelas de negócio e segurança
│   ├── 002_remover_schema_legado.sql # Remoção segura das tabelas vazias legadas
│   ├── 006_imagem_bolo.sql  # Armazenamento binário e restrição de formatos das fotos
│   └── 007_seguranca_admin.sql # Bloqueio persistente de tentativas de login
├── docs/
│   └── DOCUMENTACAO.md     # Documento único de especificação, segurança e checklist
├── server.ts               # Ponto de entrada Express com Vite middleware
├── .env.example            # Declaração padronizada de variáveis de ambiente
└── package.json            # Scripts de build, dev e dependências
```

---

## 5. Checklist de Tarefas e Implementação

- [x] Definição de arquitetura e separação de pastas (`api/`, `web/`, `migrations/`, `docs/`)
- [x] Criação do script de migração PostgreSQL (`migrations/001_initial_schema.sql`)
- [x] Configuração da persistência PostgreSQL com bloqueio de reservas quando o banco estiver indisponível
- [x] Endpoints de bolos: listagem, cadastro, edição e atualização de estoque
- [x] Endpoints de pedidos: criação com decremento automático de estoque e webhook de Telegram
- [x] Endpoints de métricas e status para o painel do administrador
- [x] Frontend com React e animações fluidas via `motion/react`
- [x] Catálogo do cliente exibindo estoque em tempo real (ex.: "Últimas 2 fatias", "Esgotado")
- [x] Modal de reserva restrito a entrega residencial, sem retirada ou balcão
- [x] WhatsApp validado para o Espírito Santo com DDD `27`
- [x] Telegram removido da interface; bot mantido somente como notificação automática do backend
- [x] Endereço livre substituído por `bloco` e `apartamento` para entregas exclusivas no condomínio
- [x] Categorias de bolo reduzidas a `Comum` e `Com cobertura`, com validação na API e no PostgreSQL
- [x] Catálogo exibe mensagem amigável com emojis quando a categoria não possui bolos disponíveis
- [x] Comunicação pública revisada para apresentar bolos caseiros comuns e com cobertura, sem linguagem de painel ou produto artesanal
- [x] Termos técnicos de banco de dados e arquitetura removidos do cabeçalho e rodapé públicos
- [x] Campo de URL substituído por seleção de foto do dispositivo com prévia no cadastro e na edição
- [x] Imagens PNG, JPG e WebP armazenadas como `BYTEA` no PostgreSQL e servidas por rota pública da API
- [x] Validação dupla de formato real e limite de 3 MB, coberta por testes unitários
- [x] Painel do Administrador com ajuste rápido de estoque (+/-), cadastro e alteração de status
- [x] Validação de segurança, prevenção de IDOR e conformidade com LGPD
- [x] Atualização de `.env.example` e scripts no `package.json`
- [x] Dependências instaladas por `npm ci` e auditadas sem vulnerabilidades conhecidas (`npm audit`)
- [x] Vite + Express configurados em `http://127.0.0.1:5188`
- [x] Schema `vendas_de_bolo` criado no PostgreSQL Docker local, com cinco tabelas de negócio e uma tabela técnica de segurança
- [x] Migration inicial ajustada para não inserir dados demonstrativos
- [x] TypeScript (`npm run lint`) e build de produção validados
- [x] Identidade visual renomeada para `Delícias da Jú` em interface, metadados e mensagens da aplicação
- [x] Tema convertido para modo claro com superfícies rosa-claro/brancas, ações pink, apoio violeta e azul-bebê
- [x] Estados de erro e sucesso preservados com cores semânticas e contraste legível
- [x] Schema mínimo em português: `usuarios`, `bolos`, `pedidos`, `itens_pedido`, `logs` e `tentativas_login`
- [x] Login administrativo protegido no backend e interface; catálogo público sem login
- [x] Token removido do `sessionStorage` e substituído por cookie de sessão assinado, `HttpOnly`, `SameSite=Strict` e `Secure` em produção
- [x] Proteção de origem/CSRF, HSTS, CSP, anti-clickjacking e anti-MIME-sniffing implementados
- [x] Bloqueio de força bruta persistente no PostgreSQL, sem armazenar IP em texto puro
- [x] Teste local confirmou cinco falhas com resposta uniforme e bloqueio da sexta tentativa (`429`)
- [x] Sete testes unitários, TypeScript e build de produção aprovados após o endurecimento
- [x] Rotas de estoque, bolos, imagens, pedidos e métricas continuam protegidas exclusivamente no backend
- [x] Reserva e débito de estoque executados atomicamente com bloqueio de linhas (`FOR UPDATE`)
- [x] Notificação automática enviada pelo bot Telegram após a reserva
- [x] Cliente recebe confirmação em tela e aviso de contato posterior pelo WhatsApp
- [x] Teste integrado local validou login, estoque, logs e entrega ao Telegram; dados fictícios removidos
- [x] Notificação Telegram usa texto puro, sem botão ou HTML, com URL direta do WhatsApp
- [x] URL da notificação inclui mensagem padrão pré-preenchida, com saudação conforme o horário
- [x] Mensagem padrão do WhatsApp: “Já vi o seu pedido e estou providenciando tudo. Aguarde sua entrega, por gentileza.”, com emojis
- [x] Pedido permite selecionar PIX ou CRÉDITO antes do envio
- [x] PIX exibe código copia e cola BR Code com a chave PIX configurada e o valor total do pedido
- [x] CRÉDITO informa pagamento por aproximação no ato da entrega
- [x] Forma de pagamento é persistida no PostgreSQL e enviada na notificação do Telegram
- [x] PDF baixado pelo cliente inclui a forma de pagamento selecionada
- [x] Registros diários e históricos mensais consideram o fuso `America/Sao_Paulo`, evitando divergência com o UTC do PostgreSQL
- [x] Registros do dia exibem somente pedidos da data atual; pedidos anteriores exibem o quantitativo geral
- [x] Testes de UI locais: catálogo carregado, carrinho aberto, modal de finalização exibido e seletor PIX validado
- [x] Testes de API locais: `/api/health` retornou 200 com PostgreSQL ativo, `/api/cakes` retornou 200 e `/api/orders` sem sessão retornou 401
- [x] Testes unitários existentes aprovados: 7 testes
- [x] Testes de pedido não criaram nova venda para preservar os registros reais do banco
- [x] Cardápio público recebeu papel de parede sutil com ilustrações de cupcakes e bolos na paleta atual
- [x] Interface mobile-first otimizada entre 320 px e 639 px, preservando integralmente a composição desktop existente
- [x] Catálogo mobile convertido para cards horizontais com tipografia legível, controles de toque de 44 px e carregamento assíncrono de imagens
- [x] Cabeçalho mobile compactado sem rolagem horizontal, com navegação e carrinho identificados para tecnologias assistivas
- [x] Checkout mobile convertido em tela cheia com etapas de sacola e entrega, ajuste de quantidade, ação fixa e controle de foco do diálogo
- [x] Painel administrativo preparado para mobile com abas roláveis, estoque e pedidos convertidos de tabelas largas para cards
- [x] Preferência de redução de movimento, foco visível, idioma `pt-BR`, áreas seguras e prevenção de zoom indevido em campos aplicados
- [x] Validação responsiva realizada em 320 × 568, 390 × 844 e 1280 × 800; desktop permaneceu com a composição original
- [x] TypeScript, sete testes unitários e build de produção aprovados após a otimização mobile
- [x] Abas administrativas mobile reorganizadas em grade 2 × 2, eliminando a rolagem horizontal
- [x] Catálogo mobile reorganizado em duas colunas com cards reduzidos, imagens de 80 px, contador de 36 px e ingredientes acessíveis por botão compacto
- [x] Separação visual dos cards mobile reforçada com espaçamento de 12 px, borda rosa de 2 px e sombra curta
- [x] Sombreamento mobile dos cards reforçado em duas camadas, preservando a aparência delicada e o desktop original
- [ ] Trocar a senha administrativa atual por uma senha longa, única e aleatória antes do deploy em produção
- [ ] Cadastrar `ADMIN_SESSION_SECRET`, `DATABASE_URL` e tokens como variáveis sensíveis na Vercel
- [ ] Definir política de retenção e exclusão para nome, WhatsApp e endereço antes da produção (LGPD)

---

## 6. Checkpoint de Auditoria

- **checkpoint**:
  - **data_interacao**: 2026-09-09
  - **iteracao**: 18
  - **autor**: André (via Assistente de Engenharia e DevOps)
  - **versao_arquitetura**: 1.5.3
  - **status**: Cards mobile receberam sombra posterior reforçada em duas camadas; desktop preservado
  - **hash_referencia**: `sem-hash-repositorio-git-ausente`

---

## 7. Adaptação para Vercel e Supabase

- [x] Entrada Express adaptada para uma única Vercel Function em `api/index.ts`
- [x] Arquivos auxiliares da API prefixados com `_` para não virarem funções independentes
- [x] Build Vite, rewrites da API/SPA e cabeçalhos definidos em `vercel.json`
- [x] Prototipação local preservada por `server.ts` e `npm run dev`
- [x] Supabase Pooler reconhecido por `URL_SUPABASE`, mantendo `DATABASE_URL` local
- [x] Segredos locais, runtime da Vercel, arquivos de IDE e logs excluídos do Git
- [x] Manifesto mobile/PWA criado sem alterar o layout responsivo existente
- [x] GitHub Actions criado para auditoria, testes, TypeScript e build Vercel
- [x] Migration master idempotente criada para um Supabase novo
- [x] Testes unitários, TypeScript e build Vercel aprovados

`URL_SUPABASE` deve armazenar a URI PostgreSQL do Supabase Pooler (`postgresql://...`), não a URL HTTPS do projeto. `SERVICE_ROLE_SUPABASE` permanece somente no backend e nunca deve receber o prefixo `VITE_`.

A API não usa views; portanto, a migration master cria apenas os objetos consumidos pela aplicação. O acesso direto por `anon` e `authenticated` é bloqueado, e o backend continua sendo a única fronteira de autorização.

Checkpoint: adaptação Vercel/Supabase e migration master em 2026-09-10; hash oficial indisponível porque o diretório ainda não é um repositório Git.

---

## 8. Recuperação do Repositório para Deploy

- [x] Pastas `.github`, `api`, `docs`, `migrations`, `public`, `src`, `tests` e `web` recuperadas da cópia local completa
- [x] `api/index.ts` restaurado para corresponder à função declarada em `vercel.json`
- [x] `local_db.env` e `token_telegram_vendas.env` removidos do versionamento e mantidos apenas no ambiente local
- [x] Dependências auditadas sem vulnerabilidades conhecidas
- [x] TypeScript e build Vercel validados após a recuperação

Checkpoint: recuperação dos arquivos ausentes para novo commit e deploy em 2026-09-10; base Git `c63a353`.
