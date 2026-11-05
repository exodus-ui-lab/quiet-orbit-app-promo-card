// Every error response shares one shape: { ok: false, error, message, ...details }.

const FIELD_MESSAGES = {
  invalid_channel: 'Choose SMS or email.',
  required: 'Enter where the link should go.',
  invalid_phone: 'Use an international number, like +47 912 34 567.',
  invalid_email: 'That email address does not look complete.',
  too_long: 'That address is too long.',
  invalid_platform: 'Choose Phone or Tablet.',
};

export class ApiError extends Error {
  constructor(statusCode, body, headers = {}) {
    super(body.message);
    this.statusCode = statusCode;
    this.body = body;
    this.headers = headers;
  }
}

/** `fields` maps field name to error code, in form order; the message describes the first one. */
export function validationError(fields) {
  const [firstCode] = Object.values(fields);
  return new ApiError(400, { ok: false, error: 'validation', message: FIELD_MESSAGES[firstCode], fields });
}

export function invalidBody() {
  return new ApiError(400, { ok: false, error: 'validation', message: 'Send the request as a JSON object.', fields: {} });
}

export function rateLimited(retryAfterSeconds) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  const message = `Too many requests. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
  return new ApiError(
    429,
    { ok: false, error: 'rate_limited', message, retryAfterSeconds },
    { 'retry-after': String(retryAfterSeconds) },
  );
}

export function notFound() {
  return new ApiError(404, { ok: false, error: 'not_found', message: 'There is nothing at this address.' });
}

export function serverError() {
  return new ApiError(500, {
    ok: false,
    error: 'server',
    message: 'Something went wrong on our side. Please try again in a moment.',
  });
}
