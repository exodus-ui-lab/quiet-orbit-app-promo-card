import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';

import { logDelivery } from './delivery.js';
import { ApiError, invalidBody, notFound, rateLimited, serverError } from './errors.js';
import { appInfoRoutes } from './routes/app-info.js';
import { appLinkRoutes } from './routes/app-link.js';
import { downloadRoutes } from './routes/download.js';

const BODY_LIMIT_BYTES = 4096;
const DEFAULT_LIMITS = {
  ip: { max: 5, windowMs: 10 * 60_000 },
  recipient: { max: 3, windowMs: 60 * 60_000 },
};

/**
 * Builds the API without listening, so tests can drive it with app.inject().
 *
 * @param {object} [options]
 * @param {boolean | object} [options.logger] Fastify logger setting (off by default).
 * @param {boolean} [options.trustProxy] Honour X-Forwarded-For; enable only behind your own proxy.
 * @param {string} [options.allowedOrigin] The one cross-origin caller to allow; same-origin only when unset.
 * @param {{ ip?: object, recipient?: object }} [options.limits] Overrides for { max, windowMs } per limit.
 * @param {Function} [options.deliver] Sends the link: (delivery, log) => void | Promise<void>.
 */
export async function buildApp({ logger = false, trustProxy = false, allowedOrigin, limits = {}, deliver = logDelivery } = {}) {
  const app = Fastify({ logger, trustProxy, bodyLimit: BODY_LIMIT_BYTES });

  await app.register(cors, {
    origin: allowedOrigin || false,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: false,
  });
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (request, context) => rateLimited(Math.ceil(context.ttl / 1000)),
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'same-origin');
    if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
  });

  app.setNotFoundHandler(() => {
    throw notFound();
  });

  app.setErrorHandler((error, request, reply) => {
    let apiError = error;
    if (!(error instanceof ApiError)) {
      // Other 4xx errors come from Fastify's body parsing: malformed JSON, oversized or non-JSON bodies.
      const fromBodyParsing = error.statusCode >= 400 && error.statusCode < 500;
      if (!fromBodyParsing) request.log.error({ err: error }, 'unhandled error');
      apiError = fromBodyParsing ? invalidBody() : serverError();
    }
    return reply.code(apiError.statusCode).headers(apiError.headers).send(apiError.body);
  });

  await app.register(appInfoRoutes);
  await app.register(downloadRoutes);
  await app.register(appLinkRoutes, {
    ipLimit: { ...DEFAULT_LIMITS.ip, ...limits.ip },
    recipientLimit: { ...DEFAULT_LIMITS.recipient, ...limits.recipient },
    deliver,
  });

  await app.ready();
  return app;
}
