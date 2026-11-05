import { APP_INFO } from '../catalog.js';

export async function appInfoRoutes(app) {
  app.get('/api/app', async (request, reply) => {
    reply.header('cache-control', 'public, max-age=300');
    return APP_INFO;
  });
}
