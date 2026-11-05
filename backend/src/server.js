import { buildApp } from './app.js';

const app = await buildApp({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  trustProxy: process.env.TRUST_PROXY === 'true',
  allowedOrigin: process.env.ALLOWED_ORIGIN,
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
}

await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
