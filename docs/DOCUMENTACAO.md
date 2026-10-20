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

---

## 9. Correção do Runtime Serverless ESM

- [x] Runtime Logs da Vercel consultados por sessão autenticada
- [x] Falha `ERR_MODULE_NOT_FOUND` identificada antes da conexão com o banco
- [x] Imports relativos do backend ajustados para extensões `.js` compatíveis com o runtime ESM
- [x] Sete testes unitários, TypeScript e build Vercel aprovados após a correção

Checkpoint: correção dos imports ESM da função Vercel em 2026-09-10; base Git `9a43000`.

---

## 10. Master Supabase e Administrador Único

- [x] `migrations/000_master_supabase.sql` consolida as seis tabelas finais, relacionamentos, índices e validações, sem apagar registros.
- [x] Tabela `usuarios` limitada a uma única linha por índice único de expressão constante, também aplicado na inicialização do backend.
- [x] Bootstrap do administrador tolera a existência do único usuário sem substituir sua senha ou criar outro ao mudar as variáveis iniciais.
- [x] RLS habilitada nas seis tabelas, com policies restritivas de negação de acesso direto e revogação de privilégios de `PUBLIC`, `anon` e `authenticated`.
- [x] README documenta execução isolada da master, criação do primeiro admin e variáveis exatas da Vercel.
- [ ] Executar a master e validar privilégios/RLS com papéis reais em banco autorizado; nenhuma conexão de integração foi realizada nesta tarefa.

A autenticação permanece própria da API: cookie assinado com `ADMIN_SESSION_SECRET`, credencial scrypt em `usuarios` e rotas administrativas protegidas no backend. Não usa Supabase Auth. A conexão privilegiada PostgreSQL ignora RLS; as policies não representam a sessão administrativa da aplicação. `ANON_KEY_SUPABASE` e `SERVICE_ROLE_SUPABASE` não são usadas pelo código atual.

Em projeto novo, executar somente a master no SQL Editor como `postgres`, sem rodar as migrations históricas em sequência depois. A master não converte qualquer schema legado e aborta se houver vários usuários, sem excluir dados automaticamente. O admin é criado no primeiro início do backend com `ADMIN_INITIAL_USER` e `ADMIN_INITIAL_PASSWORD`; remover essas variáveis após confirmar o login. A conexão da Vercel usa `URL_SUPABASE` com URI PostgreSQL do Pooler e `PGSCHEMA=vendas_de_bolo`. O chat de notificações usa exatamente `TELEGRAM_CHAT_ID`.

Validação local: sete testes unitários aprovados, TypeScript (`npm run lint`) e build Vercel aprovados; Gitleaks no histórico sem achados, e `git diff --check` sem erros. Testes e build exigiram execução fora da restrição de subprocessos após `spawn EPERM`. A migration foi revisada estaticamente; seu SQL, a unicidade e as policies ainda não foram executados/validados em PostgreSQL.

Checkpoint: 2026-10-19; base Git `00de1e6`; alterações locais sem commit, push ou execução no Supabase. André confirmou login tradicional em `usuarios`, com um único administrador e nenhum cadastro de outros usuários. Solicitou cadastro direto no banco: preparado `migrations/009_admin_inicial.local.sql`, ignorado pelo Git, com hash scrypt verificado localmente para senha correta e incorreta. Nenhuma senha em texto puro no SQL ou documentação. Após erro 23505 reportado por André no índice `idx_usuarios_admin_unico`, o script foi ajustado para `ON CONFLICT ((TRUE)) DO UPDATE`: cria se vazio ou atualiza o único admin, preservando o ID, substituindo login/hash e reativando a conta. Hash conferido localmente; execução do SQL corrigido em banco ainda não realizada pelo agente. Destino confirmado: Supabase `tndtlnmgofpzwuakvxdt`. Configuração encontrada aponta apenas para localhost; painel do projeto redirecionou ao login, sem sessão autenticada. Usuário executou a versão inicial e reportou conflito de unicidade; a versão corrigida está pronta para execução no SQL Editor. Nenhuma escrita em banco foi realizada pelo agente. Cadastro SQL dispensa as duas variáveis de bootstrap, mantendo o segredo de sessão.


---

## 11. Ambiente local PostgreSQL 17

- Instância existente PostgreSQL 17.2, loopback 127.0.0.1:5432, banco db; nenhum serviço compartilhado foi alterado.
- Master aplicada no schema vendas_de_bolo com as seis tabelas, RLS e índice de administrador único. Seed privado aplicado ao admin local.
- Reaplicação da master e seed validada pelo comando db:setup, preservando o único administrador.
- Teste SQL de segundo administrador bloqueado pelo índice; papel temporário com grants não conseguiu ler o admin nem inserir devido à RLS. Transações de teste revertidas, sem manter o papel temporário.
- API local respondeu com PostgreSQL ativo; login, cookie e consulta administrativa autenticada passaram. Consulta sem sessão retornou 401. Nenhuma notificação Telegram foi enviada.
- local_db.env preserva credenciais existentes e recebe segredo local de sessão e bind em loopback. Tokens Telegram vazios neste ambiente evitam notificações reais.
- scripts/local-db.mjs fornece db:status, db:setup e db:sql, limitados a PostgreSQL 17 local. db:setup reaplica o seed privado se presente; db:sql executa o arquivo informado e imprime resultados.
- .local/, módulos, builds, logs, configurações e SQL com credencial estão ignorados. Manifesto, lockfile, scripts e migrations de schema podem ser versionados.
- Auditoria do lockfile NPM sem vulnerabilidades conhecidas antes da instalação. Instalação recuperada pelo cache: lucide-react extraído com tar nativo após conferir SHA-512 e versão; npm rebuild sem scripts concluiu os comandos locais e npm ls --depth=0 não apontou dependências ausentes. Lockfile e versões preservados.
- Sete testes unitários, TypeScript e build Vercel aprovados. Após reiniciar o app, health confirmou PostgreSQL ativo e o Vite serviu main.tsx, AdminDashboard.tsx e CSS com HTTP 200, sem erros no log. Login, sessão e proteção de pedidos conferidos pela API.
- Navegador integrado não anexou a aba local, portanto a inspeção visual não foi concluída.

Checkpoint: 2026-10-19; base Git 00de1e6; app em http://127.0.0.1:5188, processo em segundo plano registrado em .local/app.pid e logs em .local/app.out.log e .local/app.err.log. Banco, API, módulos e build locais verificados; navegador visual indisponível. Manter o terminal do PostgreSQL existente aberto. Nenhuma alteração executada no Supabase, nenhum commit, push ou deploy.


---

## 12. Catálogo com prioridade mobile

- Estado vazio agora usa todas as colunas em qualquer breakpoint; ícone vetorial e texto centralizado substituem a composição de emojis que ficava estreita no celular.
- Banner com texto mais curto, hierarquia e contraste revisados; filtros em duas áreas iguais no celular.
- Cards em uma coluna abaixo de 360 px, duas até tablet, três a partir de 768 px e quatro em telas grandes. Imagens maiores, bordas suaves e controles de toque de 44 px.
- Quantidade e botão de adicionar ficam em linhas separadas para caber nas larguras intermediárias. Barra do pedido compacta no mobile, com acesso Ver pedido e respeito à área segura.
- Navegador validado em 320, 360, 390, 430, 768 e 1280 px: sem rolagem horizontal; estado vazio ocupa a largura integral da grade. Cards verificados com nome longo, estoque baixo e esgotado, sem overflow interno.
- Ingredientes, quantidade, categoria e adição ao pedido conferidos com fixture isolada em .local; nenhum produto fictício foi gravado no PostgreSQL. Esse teste não realizou checkout nem integração de pedido.
- TypeScript e build Vercel aprovados. Captura do catálogo real em .local/catalog-mobile-390.png; arquivos de QA continuam ignorados pelo Git.

Checkpoint: 2026-10-19; base Git 00de1e6; ajustes apenas em web/components/CakeCatalog.tsx, src/index.css e documentação nesta etapa. Servidor local com HMR ativo; sem commit, push ou deploy.


### Ajuste de densidade mobile

Em 2026-10-19, por solicitação de André, os controles do catálogo foram compactados: filtros e botões principais de 36 px; quantidade e ingredientes de 32 px; imagens de 96 px e menores espaçamentos no banner, cards, navegação e estado vazio. Desktop mantém suas regras de breakpoint. Verificação em navegador de 320, 360, 390, 430 e 768 px sem overflow horizontal; card real com 258–280 px nas larguras de celular. TypeScript aprovado. Sem alteração de regras de negócio ou dados. Checkpoint: base Git 00de1e6, alterações locais sem commit/deploy.


### Estoque e CRUD proporcionais no mobile

Em 2026-10-19, lista de estoque reorganizada em duas linhas por item: miniatura/nome e preço acima, quantidade e ações abaixo. Categoria fica no cabeçalho de grupo e descrição permanece no desktop. Botões de 32 px, resumos curtos e campos sem overflow. Item real com 98 px; fixture de seis bolos com nomes longos apresentou 98–99 px por linha em 320, 390 e 430 px, sem gravação desses produtos no banco.

Formulário de cadastro/edição com cabeçalho separado, conteúdo com scroll interno, categoria inteira, preço/estoque em colunas iguais e ações do mesmo tamanho. Dialog e botão de fechar identificados. Testado de 320×568 a 768×900: preço/estoque com largura, altura e alinhamento iguais, botões simétricos e visíveis, sem overflow horizontal. Inputs de 40 px no mobile preservam fonte de 16 px.

TypeScript e build Vercel aprovados. Validação visual e de geometria; não foram enviados formulários de criação/edição, alteração de estoque nem exclusão. Checkpoint: base Git 00de1e6, ajustes em AdminDashboard.tsx e index.css; sem commit, push ou deploy.


### Cobertura avulsa e Sobremesas

Em 2026-10-19, categorias centralizadas em shared/categories.ts para catálogo, tipos, formulário e validação da API: Comum, Cobertura (potinho avulso) e Sobremesas (doces). Identificador legado com_cobertura preservado; nova categoria sobremesas. Cabeçalhos do estoque incluem as três categorias e o formulário passa a cadastrar itens, com orientação sobre potinhos e doces. Textos de carrinho/reserva deixam de contar apenas bolos.

Master e schema inicial em runtime atualizados. Migration incremental 010_categorias_sobremesas.sql aplicada somente no PostgreSQL local; aceita sobremesas sem apagar ou converter itens existentes. Inserção SQL de validação revertida, sem manter produto fictício. Para Supabase existente, executar a migration 010 antes do deploy; não foi acessado nem alterado nesta etapa.

Validações: nove testes unitários aprovados, TypeScript e build Vercel aprovados; navegador confirmou as três opções no cadastro, dicas correspondentes e filtros sem cortes entre 320 e 430 px. Fixture isolada confirmou a filtragem de sobremesa. Nenhum formulário real de cadastro foi enviado nesta validação. Checkpoint: base Git 00de1e6; mudanças locais sem commit, push ou deploy.


### Filtros individuais e contagem de cards

Em 2026-10-19, categorias do catálogo passaram a botões arredondados individuais, sem contêiner segmentado. Cada nome mostra a contagem de registros/cards da respectiva categoria, usando a mesma lista que alimenta a grade; não soma unidades em estoque e inclui cards esgotados que continuam publicados. Fixture com três cards comuns e dez unidades somadas exibiu Comum (3); botões couberam em uma linha a 320 px sem overflow. Checkpoint: base Git 00de1e6; mudança em CakeCatalog.tsx e documentação, sem alteração de dados.


### Remoção da descrição do formulário e da tabela

Em 2026-10-19, removidos campo/estado de descrição do formulário administrativo, envio de description no payload e texto descritivo da tabela de estoque. Nome e ingredientes permanecem; categoria, preço, quantidade e foto seguem disponíveis. Coluna e contrato da API preservados, sem apagar descrições existentes: atualização sem description mantém o valor armazenado. Navegador confirmou ausência de textarea no formulário e de descrição na tabela. TypeScript aprovado; ajuste apenas de interface, sem envio de formulários ou alteração de dados. Checkpoint: base Git 00de1e6; sem commit/deploy.


### Remoção definitiva da coluna de descrição dos itens

Em 2026-10-19, por autorização explícita de André, removida a coluna vendas_de_bolo.bolos.descricao no PostgreSQL local. Backup privado prévio em .local/backups/bolos-descricao-1792458394082.json (ignorado pelo Git). Três itens preservados, com nomes, ingredientes, categorias, preços e quantidades comparados antes/depois. logs.descricao e o campo description de respostas da API Telegram foram preservados por terem funções independentes.

Migration incremental 011_remover_descricao_itens.sql criada, sem CASCADE. Master e schema do runtime para projetos novos não recriam a coluna. Tipos, projeções, INSERT/UPDATE e rotas de itens deixam de usar description; removida também sua exibição no catálogo desktop. Backend local reiniciado.

Validação: nove testes unitários, TypeScript e build Vercel aprovados. Criação, edição e leitura pelas funções reais do repositório SQL passaram dentro de transação revertida, verificando posição dos parâmetros, preço, categoria, quantidade e ingredientes. API pública retornou 200 com três itens e sem description; health indicou PostgreSQL ativo. Supabase não alterado: publicar o código atualizado antes de executar a migration 011 para não quebrar o backend antigo. Checkpoint: base Git 00de1e6; sem commit, push ou deploy.


### Diagnóstico do deployment publicado — 2026-10-20

Leitura autorizada de https://vendas-de-bolo.vercel.app/api/health e /api/cakes retornou HTTP 503 com password authentication failed for user postgres. O código local prioriza DATABASE_URL sobre URL_SUPABASE; teste com URI fictícia confirmou que pg interpreta corretamente host, usuário, porta e senha da URI, sem sobrescrevê-los com defaults locais. Nenhuma credencial real foi lida ou exibida.

CLI Vercel autenticada, mas inspect do domínio não encontrou o deployment no escopo de equipe disponível. Painel web redirecionou ao login; aba deixada para o usuário entrar com a conta proprietária do projeto. Ainda não foi possível conferir as variáveis e o deployment efetivamente usados pelo domínio. Não há evidência suficiente para afirmar senha incorreta, URI incorreta ou ausência de redeploy como causa específica. Nenhuma variável, conta, senha, banco remoto ou deployment alterado. Checkpoint: base Git 00de1e6; diagnóstico pendente de acesso ao projeto Vercel correto.

Após login do usuário, painel confirmou o projeto meu3/vendas-de-bolo e deployment Production Ready da revisão e3a48cc7e3faf72d021abb5503da6f139b29f395. DATABASE_URL existe como Secret somente em Production; valores salvos são write-only, portanto a URI não pôde ser conferida. Variável e deployment aparecem com idade aproximada de nove horas, sem evidência suficiente da ordem entre eles. A conta da CLI difere da conta do painel. Não houve edição de variável nem redeploy. Teste psql preparado com senha interativa e SELECT 1 foi cancelado antes da autenticação porque o terminal da ferramenta não ficou disponível no terminal do usuário. Próximo passo: usuário executar psql no terminal visível para distinguir rejeição da senha de erro na URI. Checkpoint: 2026-10-20; diagnóstico em aberto, sem alteração no Supabase.

### Acesso Supabase por HTTPS — 2026-10-20

Por solicitação de André, backend adaptado para a Data API HTTPS com fetch nativo, sem novas dependências. URL_SUPABASE (ou SUPABASE_URL) seleciona HTTPS e tem prioridade sobre DATABASE_URL; falhas não retornam silenciosamente à conexão antiga. SERVICE_ROLE_SUPABASE aceita chave secret ou service_role legada, exclusivamente no servidor; anon/publishable são recusadas. Chaves secret usam apikey, e somente JWT legado recebe Bearer. Timeout de 15 segundos, redirects bloqueados, respostas de erro sanitizadas e nenhuma repetição automática de gravações. PostgreSQL 17 direto permanece disponível localmente quando não há URL HTTPS configurada.

Migration 012_supabase_https.sql adiciona public.vendas_backend com operações fixas e duas funções auxiliares no schema privado. SECURITY DEFINER com search_path vazio e referências qualificadas; execução revogada de PUBLIC/anon/authenticated e concedida a service_role. Não expõe as tabelas nem modifica suas policies; instalar como postgres. Sem SQL dinâmico, DDL de runtime ou exclusão de dados. Pedidos, baixa de estoque e logs permanecem atômicos, com bloqueio de produtos em ordem de ID e agregação de itens repetidos. CRUD, imagens BYTEA, filtros de pedidos, dashboard e tentativas de login preservados. Senha do admin continua validada com scrypt no backend; Supabase Auth não foi introduzido.

Validações: 13 testes unitários com HTTP simulado aprovados, TypeScript, build Vercel e build completo Express aprovados. Com autorização explícita, master e migration foram executadas num schema isolado do PostgreSQL 17 local, dentro de transação revertida: CRUD/imagem, estoque/logs, pedido com itens repetidos, rejeição por estoque insuficiente, pedido inválido, filtros, dashboard, admin e rate limit passaram. Permissões conferidas: anon/authenticated sem execução RPC nem uso do schema; service_role executou health; papel sem grant recebeu acesso negado. Schema, fixtures e papéis criados para o teste foram desfeitos. Essa validação não equivale a integração real com PostgREST/Supabase.

Gitleaks sem achados nos arquivos de código/configuração alterados; varredura da pasta também identificou credenciais apenas nos arquivos privados local_db.env e token_telegram_vendas.env, cujo ignore foi confirmado. Opengrep não disponível. README e .env.example atualizados com configuração e ordem de ativação. Checkpoint: base Git e3a48cc; sem commit, push, alteração de variável, migration remota ou deploy. Para ativar: executar 012 no Supabase, configurar URL_SUPABASE HTTPS e SERVICE_ROLE_SUPABASE no backend Vercel, manter ADMIN_SESSION_SECRET e publicar o código com novo deploy. DATABASE_URL não é necessária na Vercel nesse modo.

Rechecagem em 2026-10-20 após relato do usuário: /api/health e /api/cakes do domínio publicado retornaram 503 com a mensagem antiga que exige URI PostgreSQL. Essa mensagem não existe mais no código local ajustado; HEAD continua em e3a48cc, com transporte HTTPS e migration 012 ainda sem commit/push. Portanto o deployment continua executando o backend anterior, e repetir redeploy desse código não inclui as alterações locais. Nenhuma nova troca de credenciais é indicada por esse erro. Publicação pendente de autorização para commit/push e consequente deploy de produção; status da migration remota não verificado.
