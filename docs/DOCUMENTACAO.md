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

### Revisão de bugs e segurança — 2026-10-20

Escopo autorizado: testes locais e PostgreSQL local isolado, sem requisições a produção, Supabase real ou Telegram. Código funcional não alterado nesta revisão. Durante a execução foi observado HEAD 1c35d1a (correção do bug), criado externamente ao agente; nenhum commit, push ou deploy foi executado por esta revisão. O estado de publicação não foi consultado.

Evidências e limites:

- npm test: 13 testes aprovados; npm run lint aprovado.
- Harness HTTP local com Data API/Telegram simulados: 16 verificações positivas e 10 divergências de comportamento. Cookie administrativo obtido pelo login do próprio servidor de teste; a primeira rodada com cookie sintético foi descartada para as verificações autenticadas. Artefatos privados ignorados: .local/security-http.ts e .local/security-http-results.json.
- Teste separado de indisponibilidade inicial: primeira e segunda respostas 503, mas apenas uma tentativa de inicialização; transporte simulado voltaria a funcionar na segunda chamada. Reprodução em .local/security-init-cache.ts.
- Migration 012 e operações SQL reais aprovadas no PostgreSQL 17 em schema isolado e transação revertida: cadastro, edição, imagens, estoque, logs, pedidos com itens repetidos, estoque insuficiente, pedido inválido, períodos, dashboard, hash administrativo e rate limit. RPC negada a anon/authenticated/papel sem grant e permitida a service_role. Nenhum dado cadastrado foi alterado. Não simula o gateway PostgREST nem testa concorrência entre conexões distintas.
- Gitleaks no histórico analisado: nenhum achado. Arquivos privados e .local permanecem ignorados. Nenhum hash/senha/token real foi exibido. Opengrep/Semgrep/ZAP indisponíveis; não houve SAST/DAST automatizado completo. Revisão manual e sondagens HTTP locais não equivalem a auditoria exaustiva.

Achados reproduzidos ou verificados no código, ainda sem correção:

| Prioridade | Achado | Evidência / efeito | Correção indicada |
| --- | --- | --- | --- |
| Alta | Erro depois do pedido persistido | api/index.ts aguarda updateTelegramDelivery após criar o pedido. Falha simulada nessa RPC devolveu 500 depois do commit da reserva; cliente pode tentar de novo e duplicar pedido/baixa. | Separar confirmação do pedido de falhas de notificação/auditoria e adicionar idempotência na criação. |
| Alta | Inicialização falha fica retida | databaseInitialization armazena promessa resolvida com isPostgres=false; não limpa cache nesse ramo. Segunda requisição continuou 503 sem nova tentativa. | Liberar nova tentativa com controle de concorrência/backoff, preservando bloqueio de gravações enquanto indisponível. |
| Média | Validação de pedidos converte entradas inválidas | quantity=-5 foi convertido em 1 e pedido retornou 201; item null retornou 500. | Exigir objeto, ID inteiro positivo e quantidade inteira positiva com limites, sem conversão silenciosa. |
| Média | Validação administrativa insuficiente | Preço negativo/não finito alcança a Data API; resposta de constraint simulada resulta em 500. Estoque negativo foi aceito e encaminhado, em vez de rejeitado. Boolean('false') resulta em true. | Validar tipos, finitude, faixa de preço/estoque e boolean estrito antes da persistência. Não foi demonstrada gravação de preço negativo; o banco possui constraint. |
| Média | Desativação não impede consulta pública individual | GET /cakes/2 e /cakes/2/image retornaram 200 para fixture inativa sem sessão. Listagem pública já filtra ativos. | Exigir item ativo nas rotas públicas; permitir consulta de inativo apenas ao admin. |
| Média, condicional | Hash scrypt malformado pode aceitar qualquer senha | verifyPasswordHash aceitou formato scrypt com parte hexadecimal inválida que decodifica para buffer vazio, comparando dois buffers de tamanho zero. Não é bypass demonstrado no banco real. Consulta local mostrou 1 admin e 0 hashes malformados; remoto não consultado. | Exigir algoritmo, quantidade de partes, salt e hash hexadecimal com comprimento esperado; rejeitar formato inválido antes do scrypt. |
| Baixa | Cookie malformado causa 500 | decodeURIComponent sem tratamento lança URIError; /auth/session com cookie inválido devolveu 500. | Tratar cookie inválido como ausência de sessão. |
| Baixa | IDs parcialmente numéricos são aceitos | GET /cakes/1abc retornou o item 1. Outros handlers também usam parseInt sem validar o caminho inteiro. | Validar string decimal completa, inteiro positivo e limite do banco. |
| Risco por revisão | Ausência de limite na criação pública de pedidos | POST /orders não possui middleware de rate limit, idempotência ou outro controle de repetição; abuso pode criar reservas e consumir estoque. Não foi feita carga/negação de serviço. | Limite persistente por origem/cliente e chave idempotente; definir limites compatíveis com o uso. |
| Risco por revisão | Orçamento de tempo da Vercel | maxDuration=15 s coincide com o timeout de uma única RPC (15 s); uma requisição pode executar várias RPCs e notificação Telegram de até 10 s. Não houve teste de tempo na Vercel. | Definir orçamento de tempo da requisição e desacoplar notificação, evitando resposta ambígua após commit. |

Dependências: npm audit --omit=dev detectou proxy-addr 2.0.7 (alerta crítico, GHSA-jqcg-44mw-7w3h, corrigido em 2.0.8) e source-map-js 1.2.1 (alerta alto, GHSA-68fv-2mgg-jv7q, corrigido em 1.2.2). Versões confirmadas por npm ls. A configuração atual usa trust proxy numérico (1), não as sub-redes IPv6 descritas no advisory de proxy-addr; exploração desse CVE no app não foi demonstrada. source-map-js chega por ferramentas CSS/build; não foi identificado endpoint de produção aceitando source maps externos. Atualizar de forma controlada e repetir testes, sem npm audit fix --force automático. Fontes: https://github.com/advisories/GHSA-jqcg-44mw-7w3h e https://github.com/advisories/GHSA-68fv-2mgg-jv7q.

Controles aprovados nas sondagens: nove rotas administrativas negaram chamadas sem sessão; cookie forjado foi negado; sessão válida acessou pedidos; escrita administrativa sem origem ou com origem externa foi negada; login com origem externa negado; cookie de login apresentou HttpOnly, Secure, SameSite=Strict e prefixo __Host-. Chave privilegiada permanece no backend, e chamadas HTTPS não repetem gravações automaticamente.

Checkpoint: revisão local concluída sobre os arquivos agora presentes em 1c35d1a. Achados pendentes, sem mudanças funcionais, atualização de dependências, commit/push ou deploy pelo agente. Corrigir problemas de pedido/autenticação defensiva/recuperação e atualizar dependências antes de publicar a próxima versão.


### Correções e reteste em paralelo — 2026-10-20

Por solicitação de André, corrigidos os achados anteriores e repetidas as validações. Dois agentes atuaram em paralelo após autorização explícita: um implementou/conferiu o PDF; outro revisou as correções de segurança. O agente principal integrou e testou. Produção, Supabase real e Telegram não foram acessados ou modificados.

Correções aplicadas:

- Verificação scrypt rejeita hashes com partes extras, salt vazio/excessivo ou hash hexadecimal diferente de 64 bytes; cookie malformado vira ausência de sessão e token com partes extras é negado.
- IDs devem ser inteiros positivos completos e dentro do limite PostgreSQL. Preços/estoques rejeitam vazio, null, booleanos, não finitos, negativos e limites excessivos; quantidade exige inteiro positivo e soma por produto limitada. Estado ativo aceita booleano estrito e nome em branco é recusado. Produtos/imagens inativos não são retornados por rotas públicas; imagem usa no-store para reavaliar permissão.
- Pedidos exigem Idempotency-Key e persistem chave/hash com índice único. A mesma chave/conteúdo devolve o pedido existente sem nova baixa; conteúdo diferente recebe 409. Chaves concorrentes iguais são serializadas por advisory lock. O frontend retém somente digest e chave aleatória no sessionStorage, sem nome/telefone/endereço, e conserva a intenção em erros/reload. Confirmação bem-sucedida libera uma nova intenção.
- Limite persistente de 20 novas tentativas válidas de pedido por IP/janela fixa de 15 min, com HMAC do IP. Repetições idempotentes não consomem o limite; excesso recebe 429. Falhas na atualização da notificação são registradas sem devolver erro de pedido já confirmado. Não foram introduzidas retentativas automáticas de gravação.
- Inicialização compartilha tentativas e volta a tentar após 1s de falha. server.ts e API Vercel agora usam o mesmo middleware, evitando health 200 sem inicialização e a necessidade de reiniciar por falha inicial. HTTPS timeout 5s, Telegram 3s e orçamento Vercel 60s; idempotência protege a repetição após resposta perdida.
- A revisão independente encontrou ainda o teto de NUMERIC(10,2): pg e RPC agora rejeitam total acima de 99.999.999,99 antes de inserir/baixar estoque. Produtos ficam bloqueados na mesma ordem na RPC; cálculo preliminar usa numeric sem limite. O contador de tentativas é preservado no retorno de erro de negócio.
- proxy-addr atualizado 2.0.7→2.0.8 e source-map-js 1.2.1→1.2.2 via overrides e lockfile, sem instalação de scripts. npm audit completo retornou zero alertas conhecidos.

Migration nova: 013_pedidos_seguros.sql, após 012, adiciona duas colunas de idempotência e índice aos pedidos, move a função base para schema privado e publica wrapper protegido. Função base não é executável diretamente por service_role, anon ou authenticated; somente o wrapper é concedido ao backend. Operações existentes permanecem disponíveis e as tabelas/RLS não são abertas. A migration é reaplicável e não remove dados. Runtime HTTPS exige health version 13 para não aceitar silenciosamente RPC antiga sem proteções. Não reaplicar 012 depois 013. Master e runtime local incluem colunas para o caminho pg direto.

Validação local: 27 testes da suíte integrada aprovados, incluindo regressões HTTP para todos os casos antes divergentes, middleware de disponibilidade, acentos/paginação PDF, chave persistida sem dados pessoais e saudação. TypeScript e build completo frontend/Express aprovados. O teste de indisponibilidade com transporte simulado passou de 503 na primeira chamada para 200 após recuperação, com duas inicializações. Revisão paralela dos dois últimos ajustes não encontrou novo problema concreto.

SQL real autorizado: .local/verify-security-final.mjs validou master+012+013 e reaplicação 013 em schema isolado do PostgreSQL 17, com rollback geral; testou CRUD/imagem, pedidos/estoque/logs, filtros/dashboard/login, replay sem nova baixa, conflito 409, limite 429 e teto monetário 400 sem baixa. Caminhos RPC e repositório pg direto passaram. anon/authenticated/papel sem grant foram negados; service_role executou wrapper e ficou sem execute na função base. Não houve escrita permanente nos registros locais. Não foi validado gateway real PostgREST, implantação ou contenção entre conexões distintas.

### Saudação WhatsApp e PDF da reserva — 2026-10-20

A saudação já consultava São Paulo; o defeito visual era a lua fixa. api/_greeting.ts agora combina texto e ícone no momento do pedido: sol de manhã, sol à tarde e lua/estrelas à noite, com hourCycle h23 e America/Sao_Paulo. Testadas transições de meia-noite, 12h e 18h com datas UTC. Links já enviados ao Telegram mantêm o texto original; não foram reenviados.

PDF refeito em web/orderPdf.ts e integrado ao download no OrderModal sem dependência adicional. A4, identidade Delícias da Jú, código/data, cliente/entrega, tabela com quantidade/preço unitário/subtotal, total destacado, pagamento, observações e rodapé numerado. WinAnsi preserva acentos portugueses; strings são emitidas em hexadecimal para neutralizar comandos PDF. Nomes longos quebram linhas e itens extensos paginam; telefone pessoal não é incluído. Geração ocorre no navegador, sem serviço externo.

Três testes PDF aprovados: acentos/dados/horário, offsets/comprimentos de streams e neutralização de comandos, paginação de nomes/itens longos. Agente executou marker da skill PDF, renderizou amostras fictícias com Poppler e inspecionou as páginas; pypdf strict e pdfplumber conferiram os 70 itens, acentos e conteúdo dentro de A4. Amostras privadas ignoradas: .local/pdf/reserva-exemplo.pdf(1p) e reserva-multipagina.pdf(70itens,7p). Inspeção adicional pelo agente principal confirmou o exemplo e a página final.

Checkpoint: base Git 1c35d1a, correções locais sem commit/push/deploy pelo agente. Antes de publicar: executar 013 no Supabase como postgres, após 012, e implantar frontend/backend juntos para o cabeçalho de idempotência. Nenhuma mudança de senha ou URL adicional é necessária por causa dessas correções. Opengrep/ZAP continuam indisponíveis; revisão e testes locais não equivalem a auditoria exaustiva ou validação de produção.


### Finalização compacta e cartão crédito/débito — 2026-10-20

Rótulos de cartão agora indicam Crédito/débito e aproximação no checkout, confirmação, Telegram, PDF e painel. Identificador interno credito e schema preservados. O seletor usa rótulo curto para caber em 320px, com explicação de aproximação/entrega logo abaixo.

Finalização dividida em sacola e entrega/pagamento também no desktop. Janela flex com altura máxima 94dvh, corpo rolável e cabeçalho/ação de confirmação fora da rolagem. Lista de itens limitada a 32dvh com rolagem própria. Nome/telefone usam duas colunas no desktop; observações ficam em details recolhido. Removido espaçamento reservado ao antigo botão fixo mobile. Dados do cliente e idempotência são mantidos ao alternar etapas.

Navegador local conferiu app com item real sem enviar pedido e fixture ignorada com 20 produtos fictícios: desktop 1280x720, mobile 375x812 e 320x568. Lista com 20 itens ficou 182px em 320x568 para conteúdo 1906px, sem overflow horizontal; etapa de entrega mantém confirmação no rodapé e rolagem só no corpo em telas curtas. Retorno à sacola preservou nome digitado; botão externo permanece associado ao form checkout-order-form. Nenhuma reserva, notificação ou gravação real enviada. Evidência privada: .local/checkout-mobile-compacto.png. Checkpoint: base 1c35d1a, alterações locais preservadas, sem commit/push/deploy.

Validação final desta etapa: 27 testes aprovados, TypeScript e build Vercel aprovados.


### Cards compactos no catálogo — 2026-10-20

Reduzidos foto, espaçamento e altura dos cards em CakeCatalog.tsx. Foto de 80px no mobile e 96px no desktop; nome/preço e controles compactos, quantidade e botão lado a lado no desktop e ingredientes disponíveis por ícone com rótulo acessível. Categoria redundante sobre a foto removida, filtros e contagens preservados. Não altera preço, estoque, categorias ou lógica do carrinho.

Navegador local: card desktop 1280x720 com altura 213,65px/foto 96px; mobile 375x812 com foto 80px e sem overflow horizontal. Abrir ingredientes exibiu conteúdo; aumentar quantidade e adicionar incluiu 2 unidades, total 40,00, sem criar pedido ou gravar dados. Viewport restaurado. Checkpoint: alterações locais sem commit/push/deploy pelo agente.

TypeScript e build Vercel aprovados. Base Git observada: 0fa26f2.

### Reservas temporárias por produto — 2026-10-20

Cada produto passa a ocupar estoque ao entrar na sacola por 10 minutos, com prazo individual definido pelo relógio do banco. Alterar quantidade não estende o prazo. Ao vencer, a linha permanece riscada em vermelho e deixa de entrar no total; o cliente pode finalizar os demais produtos ou solicitar explicitamente nova reserva, sujeita à disponibilidade. Remover um item libera sua reserva. Fechar a página deixa o prazo correr; não há renovação automática.

Migration incremental: migrations/014_reservas_temporarias.sql, após 012 e 013. Cria carrinhos_reserva/reservas_carrinho privados, com RLS e sem acesso direto por anon/authenticated, e atualiza vendas_backend para versão 14. Estoque físico só diminui na confirmação; disponibilidade pública desconta reservas ainda válidas, sem depender de cron. Linhas de produtos são bloqueadas em ordem crescente e a versão da sacola evita sobrescritas. Admin recebe HTTP 409 ao reduzir estoque abaixo do reservado. Token aleatório de 32 bytes fica na sessão do navegador, trafega em X-Cart-Token e somente seu SHA-256 é persistido; POST exige mesma origem e há limite de alterações por IP. A verificação do limite precede a criação de novas sacolas. API, frontend e migration precisam ser publicados em conjunto.

Contador atualiza a cada segundo com compensação do horário do servidor. Sacola/vitrine consultam o backend a cada 3 segundos quando visíveis e ao recuperar foco; outras pessoas podem levar até essa consulta para visualizar o novo saldo, embora a transação impeça reservar a mesma unidade. Reserva vencida é liberada logicamente na consulta/transação, mesmo com página fechada. Registros vencidos são mantidos para a apresentação da sacola; não foi criado job de limpeza histórica.

A confirmação usa idempotência vinculada ao token e inclui somente reservas válidas. Se a resposta se perde depois de salvar, a interface mantém corpo, token e chave originais em memória para verificar o mesmo pedido, mesmo com sacola já alterada pelo polling. Recarregar a página perde esse corpo de recuperação; nenhum dado pessoal do pedido é armazenado no navegador por esta implementação.

Validação: 30 testes automatizados aprovados, incluindo regras do cronômetro e sondagens HTTP com mocks para origem, token, versão, renovação, limite de alterações, hash do token e conflito administrativo. TypeScript e build Vercel aprovados. PostgreSQL 17 local: 14 grupos de testes em transação com rollback; adicionalmente 12 disputas reais entre duas conexões pela última unidade e 12 confirmações duplicadas simultâneas, todas com uma reserva vencedora, um pedido e uma baixa. Inicialização real de _db executada duas vezes em schema descartável confirmou instalação local da RPC, preservação da reserva e saldo correto. Schemas descartáveis e funções públicas exclusivas desses testes foram removidos; dados da loja não foram alterados.

Navegador com fixture isolada, sem serviços reais: mobile 375x812 confirmou item vencido riscado, total só dos ativos, finalização de um produto válido e recuperação da resposta perdida após o pedido fictício já estar salvo e a sacola vazia. Evidência privada ignorada: .local/reservas-mobile.png. Não foi feita reserva, pedido, alteração de schema ou deploy no Supabase/Vercel. Checkpoint: base 0fa26f2, alterações locais sem commit/push/deploy pelo agente.

Conferência adicional em 320x568: cronômetro curto da fixture expirou automaticamente, passou a dois itens riscados/total zero e removeu a ação de continuar; renovação explícita restaurou 10:00 e total apenas daquele produto. scrollWidth/clientWidth iguais a 320, sem overflow horizontal. Gitleaks nas alterações rastreadas e nos novos arquivos: nenhum segredo detectado. Opengrep não instalado; não foi executado DAST nem teste de produção.
