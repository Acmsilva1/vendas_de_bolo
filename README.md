# Delícias da Jú — Vendas de bolo

Aplicação React/Vite com API Express, PostgreSQL/Supabase e implantação preparada para Vercel.

## Desenvolvimento local

1. Instale o Node.js 22.
2. Execute `npm ci`.
3. Copie `.env.example` para `.env` e configure `DATABASE_URL` e `PGSCHEMA`.
4. Execute `npm run dev`.
5. Acesse `http://127.0.0.1:5188`.

O servidor local continua usando `server.ts`; essa versão foi preservada para prototipação de novos projetos.

### PostgreSQL 17 nesta máquina

O ambiente local usa a instância PostgreSQL 17 existente em `127.0.0.1:5432`, banco `db`, com schema exclusivo `vendas_de_bolo`. A conexão fica em `local_db.env`, carregado por `server.ts`, e tem prioridade sobre o arquivo opcional de notificações Telegram. Preserve esse arquivo privado; evite copiar uma `.env.example` com credenciais de exemplo por cima da configuração que já funciona.

Comandos para manutenção a partir da raiz do projeto:

```sh
npm run db:status
npm run db:setup
npm run db:sql -- caminho/do/arquivo.sql
npm run dev
```

`db:setup` reaplica a mesma master usada no Supabase e, se presente, o seed privado do admin. Esse seed substitui login/senha do único admin; execute setup somente quando desejar essa configuração. `db:sql` executa o arquivo informado no banco local e imprime seus resultados, portanto revise o SQL antes de executar. Esses comandos recusam conexão fora de loopback ou uma versão diferente do PostgreSQL 17. Não iniciam nem encerram o serviço PostgreSQL compartilhado com outros projetos.

O app abre em `http://127.0.0.1:5188`. No ambiente preparado, o admin foi cadastrado diretamente em `usuarios`, sem exigir variáveis de bootstrap. Notificações Telegram locais ficam desativadas por valores vazios em `local_db.env`; configure-as nesse arquivo apenas se desejar envios reais.

O Git ignora `local_db.env`, `.env*` (exceto o exemplo), `node_modules/`, `.local/`, builds, logs e o SQL privado do admin. Scripts, master, manifesto e lockfile permanecem versionáveis. Após clonar em outra máquina, instale as dependências com `npm ci`, configure seu PostgreSQL 17 e as credenciais locais; o banco e seus dados não são enviados ao GitHub.

## Deploy pela Vercel

1. Envie o projeto a um repositório GitHub.
2. Importe o repositório na Vercel.
3. Cadastre as variáveis abaixo para Production e Preview.
4. Faça o deploy. O `vercel.json` seleciona Vite, executa `npm ci`, gera o frontend e publica a API Express como função Node.js.

Variáveis obrigatórias:

- `URL_SUPABASE`: `https://tndtlnmgofpzwuakvxdt.supabase.co` (URL HTTPS do projeto).
- `SERVICE_ROLE_SUPABASE`: chave secreta do backend, `sb_secret_...` ou a chave legada `service_role`, obtida em Settings → API Keys. Não é a senha do PostgreSQL.
- `ADMIN_SESSION_SECRET`: segredo aleatório com no mínimo 32 caracteres.

Para admin já cadastrado na tabela `usuarios`, não são necessárias variáveis de login/senha. Opcionalmente, `ADMIN_INITIAL_USER` e `ADMIN_INITIAL_PASSWORD` criam o primeiro admin, sem substituir um existente.

Variáveis já reconhecidas ou reservadas:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `ANON_KEY_SUPABASE`

`ANON_KEY_SUPABASE` e `SERVICE_ROLE_SUPABASE` não devem receber o prefixo `VITE_`. A chave `service_role` jamais pode ser exposta ao navegador.

Execute todo o arquivo `migrations/000_master_supabase.sql` no SQL Editor de um projeto Supabase novo, usando o papel `postgres`. Ele cria as seis tabelas no schema `vendas_de_bolo`: `usuarios` (administrador), `bolos`, `pedidos`, `itens_pedido`, `logs` e `tentativas_login`, com índices, relacionamentos e RLS. Não execute as migrations históricas `001` a `008` após a master: elas representam etapas anteriores do schema.

A master não apaga dados e pode ser reaplicada ao schema final compatível. Não é um reset destrutivo nem um conversor de qualquer schema legado. Se já houver mais de um usuário, a criação do índice de administrador único aborta a transação; nenhum usuário é excluído automaticamente.

### Administrador e variáveis na Vercel

Para cadastro direto no banco, execute a master e depois o script privado `migrations/009_admin_inicial.local.sql` no mesmo SQL Editor, como `postgres`. Esse script local fica ignorado pelo Git e não acompanha clones do repositório. Ele cria o admin com hash scrypt compatível com o backend ou atualiza o único registro existente, preservando seu ID e substituindo login/senha pelos definidos no script. A conta fica ativa e a execução pode ser repetida. Nessa modalidade, não configure `ADMIN_INITIAL_USER` nem `ADMIN_INITIAL_PASSWORD`. `ADMIN_SESSION_SECRET` continua obrigatório para as sessões.

O login atual é próprio da aplicação, sem Supabase Auth. A tabela `usuarios` permite no máximo um administrador, inclusive se estiver inativo. Cadastre `ADMIN_INITIAL_USER` e `ADMIN_INITIAL_PASSWORD` nos Secrets da Vercel: na primeira inicialização com banco disponível, o backend cria o administrador com hash scrypt. A migration não inclui senha padrão. Depois de confirmar o primeiro login, remova essas duas variáveis de inicialização. Alterá-las não troca a senha nem cria outro administrador quando já existe um.

`ADMIN_SESSION_SECRET` não é a senha do administrador: é um segredo aleatório usado para assinar sua sessão. Mantenha-o apenas no backend, com pelo menos 32 caracteres. Para gerar um valor, execute localmente e salve a saída diretamente nos Secrets da Vercel:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

`SERVICE_ROLE_SUPABASE` é obrigatória no modo HTTPS e permanece exclusivamente no backend. `ANON_KEY_SUPABASE` não é utilizada neste fluxo. Não use os nomes traduzidos `FUNÇÃO_DE_SERVIÇO_SUPABASE` ou `ID_DO_CHAT_DO_TELEGRAM`: o backend lê exatamente os nomes documentados (`TELEGRAM_CHAT_ID` para o chat).

RLS e policies restritivas bloqueiam o acesso direto às tabelas por papéis sujeitos a RLS; privilégios de `PUBLIC`, `anon` e `authenticated` também são revogados. O backend chama a RPC `public.vendas_backend` por HTTPS com sua chave secreta e verifica a sessão nas rotas administrativas. A RPC tem operações fixas, executa como seu proprietário (`postgres`) e permite execução somente a `service_role`; as funções auxiliares ficam no schema privado. RLS não identifica o cookie da aplicação e não restringe papéis com `BYPASSRLS`, como `postgres` e `service_role`. Não exponha essas credenciais nem adicione o schema à lista de schemas públicos da Data API.

### Ativar o acesso HTTPS no Supabase existente

1. Execute **migrations/012_supabase_https.sql** e depois **migrations/013_pedidos_seguros.sql** no SQL Editor como `postgres`, sobre o schema existente. Em projeto novo, execute primeiro a master, depois 012 e 013. Em schema antigo, aplique também a 010 para liberar Sobremesas. Não é necessário expor o schema `vendas_de_bolo` na Data API: a RPC fica em `public`.
2. Na Vercel, configure `URL_SUPABASE=https://tndtlnmgofpzwuakvxdt.supabase.co`, `SERVICE_ROLE_SUPABASE` com a chave secreta do backend e mantenha `ADMIN_SESSION_SECRET`. Não use prefixo `VITE_`.
3. Remova a antiga `DATABASE_URL` da Vercel para evitar confusão. A configuração HTTPS tem prioridade sobre ela; em caso de falha HTTPS, o backend bloqueia operações e não tenta a conexão PostgreSQL antiga.
4. Publique o código atualizado e faça novo deploy. As migrations 012 e 013 não removem dados/colunas. A 013 é obrigatória para este backend; não reaplique a 012 depois da 013, pois isso substituiria a função protegida pela versão anterior. A remoção opcional da descrição (011) mantém a ordem indicada abaixo.

O login continua próprio da aplicação: o backend recebe o hash do único admin pela RPC, compara a senha com scrypt e assina o cookie. Supabase Auth não é utilizado. Nenhuma senha em texto puro é enviada à Data API. Reservas, baixa de estoque e logs são gravados numa única transação da RPC, com bloqueio dos produtos na mesma ordem. Chamadas de gravação não são repetidas automaticamente em falhas de rede. A confirmação usa chave de idempotência para devolver a mesma reserva sem repetir a baixa, inclusive depois de recarregar a página. O navegador guarda somente o resumo criptográfico do pedido e uma chave aleatória; os dados pessoais não vão para esse armazenamento.

O modo HTTPS exige as migrations 012 e 013 e as tabelas existentes; o runtime não executa DDL pela Data API. No desenvolvimento local, deixe `URL_SUPABASE` e `SUPABASE_URL` vazias e mantenha `DATABASE_URL=postgresql://...` e `PGSCHEMA=vendas_de_bolo` no arquivo privado `local_db.env`. Esse caminho continua usando o PostgreSQL 17 local. Aliases aceitos no backend: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

Após o deploy, valide `https://SEU-DOMINIO/api/health`. O campo `database` deve indicar PostgreSQL ativo.

### Proteções na confirmação de pedidos

A migration 013 acrescenta `idempotencia_chave` e `idempotencia_hash` aos pedidos e mantém a função base no schema privado, sem permissão de execução para clientes ou service_role. A RPC pública continua executável somente pelo backend. Repetição da mesma chave/conteúdo retorna a reserva existente (HTTP 200); outro conteúdo com a mesma chave retorna 409. A interface cria e preserva o cabeçalho `Idempotency-Key`; clientes externos da API também devem enviar uma chave aleatória de 16 a 128 caracteres (letras, números, hífen ou sublinhado).

O backend limita a 20 novas tentativas válidas de pedido por IP em uma janela fixa de 15 minutos; repetições idempotentes não consomem o limite. A chave do limite usa HMAC do IP, não o endereço em texto puro. O contador é persistente e compartilhado entre instâncias. Respostas acima do limite usam 429; IPs compartilhados também compartilham essa cota. Quantidades, IDs, preços, estoque, booleanos e totais monetários são validados antes da gravação. Falhas de notificação não invalidam pedidos já confirmados.

A API local e a Vercel usam a mesma recuperação de inicialização, com novas tentativas após um segundo e compartilhamento de tentativas concorrentes. O timeout de cada chamada HTTPS é de 5 segundos, o do Telegram de 3 segundos e o orçamento da função Vercel é de 60 segundos. Isso reduz respostas ambíguas; a idempotência continua necessária para quedas de rede após o commit. Instale 013 e publique frontend/backend juntos; a interface antiga não envia a chave exigida. Para rollback de código, escolha uma versão compatível com a 013, sem remover colunas ou voltar à RPC 012.

A saudação no link WhatsApp usa o momento do pedido em `America/Sao_Paulo`: bom dia/sol antes de 12h, boa tarde/sol entre 12h e 18h e boa noite/lua a partir de 18h. Mensagens já enviadas ao Telegram preservam o texto original do link.

## Validações

### PDF da reserva

O download usa `web/orderPdf.ts`, sem biblioteca adicional: formato A4 com acentos, marca, código/data em São Paulo, cliente/entrega, tabela de itens, preços unitários/subtotais, total, pagamento e observações. Nomes longos têm quebra de linha e pedidos extensos ganham novas páginas com cabeçalho/rodapé. Não exporta o telefone pessoal do cliente. O arquivo é gerado localmente no navegador, sem upload para serviço externo.

- `npm test`: testes unitários.
- `npm run lint`: validação TypeScript.
- `npm run build:vercel`: build usado pela Vercel.
- `npm run build`: build local completo com servidor Express.

### Categorias de itens

Catálogo e estoque oferecem Comum (bolo), Cobertura (potinho avulso) e Sobremesas (doces). O identificador `com_cobertura` foi preservado para a cobertura avulsa; `sobremesas` é a nova categoria. Para um banco já criado, execute `migrations/010_categorias_sobremesas.sql` antes de publicar o código novo. Para projeto novo, a master já aceita as três categorias. A migration 010 altera apenas a constraint de categoria, sem apagar registros nem alterar preços/estoques.

### Remoção da descrição dos itens

A coluna `vendas_de_bolo.bolos.descricao` e o campo `description` dos itens foram removidos do modelo da aplicação. Para banco novo, a master já cria o schema sem essa coluna. Para banco existente, faça backup e publique primeiro o código atualizado (compatível com a coluna extra); depois execute `migrations/011_remover_descricao_itens.sql`. O backend antigo consulta essa coluna e não deve permanecer ativo após a remoção. A coluna `logs.descricao` permanece para auditoria. A migration 011 descarta as descrições dos itens e não usa CASCADE.
