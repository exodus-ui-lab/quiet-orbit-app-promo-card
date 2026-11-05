import { APP_INFO, PLATFORMS } from '../catalog.js';
import { notFound } from '../errors.js';

/**
 * GET /download/:platform: the no-JavaScript fallback for the small-screen download buttons.
 * Only known platforms redirect, so the route can never be used as an open redirect.
 */
export async function downloadRoutes(app) {
  app.get('/download/:platform', async (request, reply) => {
    const { platform } = request.params;
    if (!PLATFORMS.includes(platform)) throw notFound();
    return reply.redirect(APP_INFO.links[platform], 302);
  });
}
