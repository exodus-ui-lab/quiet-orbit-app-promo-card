import { z } from 'zod';

import { PLATFORMS } from './catalog.js';

const MAX_DESTINATION_LENGTH = 254;
const E164 = /^\+[1-9]\d{6,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// RFC 5322 specials are only legal inside quoted local parts, which we do not accept. Rejecting them also
// keeps markup out of the domain we echo back in the masked destination.
const EMAIL_SPECIALS = /[<>()[\]\\,;:"]/;
const INVISIBLE_CHARS = /[\p{Cc}\p{Cf}]/gu;

const cleanText = (value) => value.replace(INVISIBLE_CHARS, '').trim();
const normalizePhone = (value) => value.replace(/[\s().-]/g, '');
const isEmail = (value) => EMAIL.test(value) && !EMAIL_SPECIALS.test(value);
const lowerCaseDomain = (value) => {
  const [local, domain] = value.split('@');
  return `${local}@${domain.toLowerCase()}`;
};

// Each schema's error message is the contract's error code for that field.
const CHANNEL = z.enum(['sms', 'email'], { error: 'invalid_channel' });
const PLATFORM = z.enum(PLATFORMS, { error: 'invalid_platform' });
const ADDRESS = z
  .string({ error: 'required' })
  .transform(cleanText)
  .pipe(z.string().min(1, 'required').max(MAX_DESTINATION_LENGTH, 'too_long'));
const DESTINATION = {
  sms: ADDRESS.transform(normalizePhone).refine((value) => E164.test(value), 'invalid_phone'),
  email: ADDRESS.refine(isEmail, 'invalid_email').transform(lowerCaseDomain),
};

export const isJsonObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Validates a POST /api/app-link body field by field, so one response can report every problem.
 * Unknown fields are ignored.
 */
export function parseLinkRequest(body) {
  const fields = {};
  const check = (name, schema) => {
    const result = schema.safeParse(body[name]);
    if (!result.success) fields[name] = result.error.issues[0].message;
    return result.data;
  };

  const channel = check('channel', CHANNEL);
  // The destination format depends on the channel; without a valid channel only the generic rules apply.
  const destination = check('destination', DESTINATION[channel] ?? ADDRESS);
  const platform = check('platform', PLATFORM);
  if (Object.keys(fields).length > 0) return { ok: false, fields };

  const honeypotFilled = body.company !== undefined && body.company !== '';
  return { ok: true, value: { channel, destination, platform, honeypotFilled } };
}
