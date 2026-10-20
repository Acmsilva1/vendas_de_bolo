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

- `URL_SUPABASE`: URI PostgreSQL do Supabase Pooler, iniciada por `postgresql://`. Não use a URL HTTPS do projeto.
- `PGSCHEMA`: use `vendas_de_bolo`.
- `ADMIN_SESSION_SECRET`: segredo aleatório com no mínimo 32 caracteres.
- `ADMIN_INITIAL_USER`: usuário administrativo inicial.
- `ADMIN_INITIAL_PASSWORD`: senha forte para criar o administrador inicial.

Variáveis já reconhecidas ou reservadas:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `ANON_KEY_SUPABASE`
- `SERVICE_ROLE_SUPABASE`

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

`SERVICE_ROLE_SUPABASE` é a chave privilegiada do Supabase, não uma função SQL nem um usuário administrador. Ela e `ANON_KEY_SUPABASE` não são utilizadas pelo código atual e não precisam ser preenchidas para este fluxo. Não use os nomes traduzidos `FUNÇÃO_DE_SERVIÇO_SUPABASE` ou `ID_DO_CHAT_DO_TELEGRAM`: o backend lê exatamente os nomes documentados (`TELEGRAM_CHAT_ID` para o chat).

RLS e policies restritivas bloqueiam o acesso direto às tabelas por papéis sujeitos a RLS; privilégios de `PUBLIC`, `anon` e `authenticated` também são revogados. O backend usa a conexão PostgreSQL privilegiada (`postgres`) e verifica a sessão nas rotas administrativas. RLS não identifica o cookie da aplicação e não restringe papéis com `BYPASSRLS`, como `postgres` e `service_role`. Não exponha essas credenciais nem adicione o schema à lista de schemas públicos da Data API.

Para obter `URL_SUPABASE`, abra **Connect** no painel do Supabase e copie a URI PostgreSQL do Pooler (modo Transaction para o ambiente serverless), preenchendo sua senha do banco. O ID `tndtlnmgofpzwuakvxdt` sozinho não informa o host/região do Pooler. A URL `https://tndtlnmgofpzwuakvxdt.supabase.co` não serve para esta variável. Evite definir `DATABASE_URL` na Vercel se estiver usando `URL_SUPABASE`, pois `DATABASE_URL` tem prioridade no código.

Após o deploy, valide `https://SEU-DOMINIO/api/health`. O campo `database` deve indicar PostgreSQL ativo.

## Validações

- `npm test`: testes unitários.
- `npm run lint`: validação TypeScript.
- `npm run build:vercel`: build usado pela Vercel.
- `npm run build`: build local completo com servidor Express.

### Categorias de itens

Catálogo e estoque oferecem Comum (bolo), Cobertura (potinho avulso) e Sobremesas (doces). O identificador `com_cobertura` foi preservado para a cobertura avulsa; `sobremesas` é a nova categoria. Para um banco já criado, execute `migrations/010_categorias_sobremesas.sql` antes de publicar o código novo. Para projeto novo, a master já aceita as três categorias. A migration 010 altera apenas a constraint de categoria, sem apagar registros nem alterar preços/estoques.

### Remoção da descrição dos itens

A coluna `vendas_de_bolo.bolos.descricao` e o campo `description` dos itens foram removidos do modelo da aplicação. Para banco novo, a master já cria o schema sem essa coluna. Para banco existente, faça backup e publique primeiro o código atualizado (compatível com a coluna extra); depois execute `migrations/011_remover_descricao_itens.sql`. O backend antigo consulta essa coluna e não deve permanecer ativo após a remoção. A coluna `logs.descricao` permanece para auditoria. A migration 011 descarta as descrições dos itens e não usa CASCADE.
