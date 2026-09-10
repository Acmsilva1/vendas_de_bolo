import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './api/index';
import { initDatabase } from './api/_db';

dotenv.config();
dotenv.config({ path: 'local_db.env', override: false });
dotenv.config({ path: 'token_telegram_vendas.env', override: false });

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 5188;
  const host = process.env.HOST || '127.0.0.1';
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && (process.env.ADMIN_SESSION_SECRET || '').length < 32) {
    throw new Error('ADMIN_SESSION_SECRET deve ter pelo menos 32 caracteres em produção.');
  }

  if (isProduction) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; img-src 'self' data: https://images.unsplash.com; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'"
      );
    }
    next();
  });

  // Middlewares de parsing
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Inicialização do banco (PostgreSQL ou fallback resiliente)
  try {
    const dbStatus = await initDatabase();
    console.log(`[Delícias da Jú Backend] Status do banco: ${dbStatus.message}`);
  } catch (err) {
    console.error('[Delícias da Jú Backend] Erro na inicialização do banco:', err);
  }

  // Rotas da API RESTful montadas antes dos middlewares de frontend
  app.use('/api', apiRouter);

  // Integração com o Vite para servir o frontend React
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, host, () => {
    console.log(`🍰 Servidor Delícias da Jú operando em http://${host}:${port}`);
  });
}

startServer().catch(err => {
  console.error('Falha crítica ao iniciar servidor:', err);
  process.exit(1);
});
