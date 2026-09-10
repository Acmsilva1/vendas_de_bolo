# Delícias da Jú — Vendas de bolo

Aplicação React/Vite com API Express, PostgreSQL/Supabase e implantação preparada para Vercel.

## Desenvolvimento local

1. Instale o Node.js 22.
2. Execute `npm ci`.
3. Copie `.env.example` para `.env` e configure `DATABASE_URL` e `PGSCHEMA`.
4. Execute `npm run dev`.
5. Acesse `http://127.0.0.1:5188`.

O servidor local continua usando `server.ts`; essa versão foi preservada para prototipação de novos projetos.

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

Execute `migrations/000_master_supabase.sql` uma vez no SQL Editor de um projeto Supabase novo. A migration é idempotente e pode ser reaplicada com segurança.

Após o deploy, valide `https://SEU-DOMINIO/api/health`. O campo `database` deve indicar PostgreSQL ativo.

## Validações

- `npm test`: testes unitários.
- `npm run lint`: validação TypeScript.
- `npm run build:vercel`: build usado pela Vercel.
- `npm run build`: build local completo com servidor Express.
