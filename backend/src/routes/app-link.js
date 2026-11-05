import { APP_INFO } from '../catalog.js';
import { invalidBody, rateLimited, validationError } from '../errors.js';
import { maskEmail, maskPhone } from '../mask.js';
import { createSlidingWindow } from '../sliding-window.js';
import { isJsonObject, parseLinkRequest } from '../validation.js';

const SENT_MESSAGE = 'It can take up to a minute to arrive.';

/**
 * POST /api/app-link: send one platform's download link by SMS or email.
 * Options: ipLimit and recipientLimit ({ max, windowMs }), deliver(delivery, log).
 */
export async function appLinkRoutes(app, { ipLimit, recipientLimit, deliver }) {
  const recipients = createSlidingWindow(recipientLimit);
  const routeOptions = { config: { rateLimit: { max: ipLimit.max, timeWindow: ipLimit.windowMs } } };

  app.post('/api/app-link', routeOptions, async (request) => {
    if (!isJsonObject(request.body)) throw invalidBody();
    const parsed = parseLinkRequest(request.body);
    if (!parsed.ok) throw validationError(parsed.fields);

    const { channel, destination, platform, honeypotFilled } = parsed.value;
    const maskedDestination = channel === 'sms' ? maskPhone(destination) : maskEmail(destination);

    // A filled honeypot gets the normal answer so bots learn nothing, but nothing is sent and the
    // recipient's quota is left untouched.
    if (!honeypotFilled) {
      const retryAfterMs = recipients.take(`${channel}:${destination.toLowerCase()}`);
      if (retryAfterMs > 0) throw rateLimited(Math.ceil(retryAfterMs / 1000));

      const link = APP_INFO.links[platform];
      await deliver({ channel, platform, link, destination, maskedDestination, ip: request.ip }, request.log);
    }

    return { ok: true, channel, platform, maskedDestination, message: SENT_MESSAGE };
  });
}
