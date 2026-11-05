import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildApp } from '../src/app.js';

const validRequest = { channel: 'sms', destination: '+4791234532', platform: 'tablet', company: '' };

async function setup(options = {}) {
  const deliveries = [];
  const app = await buildApp({ deliver: (delivery) => deliveries.push(delivery), ...options });
  const send = (payload) => app.inject({ method: 'POST', url: '/api/app-link', payload });
  return { app, deliveries, send };
}

test('phone numbers are normalized before masking and delivery', async (t) => {
  const { app, deliveries, send } = await setup();
  t.after(() => app.close());

  const res = await send({ ...validRequest, destination: ' +47 (912) 34-532 ' });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().maskedDestination, '+47 ••• •• 532');
  assert.deepEqual(deliveries, [{
    channel: 'sms',
    platform: 'tablet',
    link: 'https://lumendrift.example/tablet',
    destination: '+4791234532',
    maskedDestination: '+47 ••• •• 532',
    ip: '127.0.0.1',
  }]);
});

test('email destinations are masked to the first letter and the domain is lower-cased', async (t) => {
  const { app, deliveries, send } = await setup();
  t.after(() => app.close());

  const res = await send({ ...validRequest, channel: 'email', destination: 'sanna@Example.COM', platform: 'phone' });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().maskedDestination, 's•••@example.com');
  assert.equal(deliveries[0].destination, 'sanna@example.com');
  assert.equal(deliveries[0].link, 'https://lumendrift.example/phone');
});

test('invalid fields are rejected with 400 and the contract error codes', async (t) => {
  const { app, deliveries, send } = await setup({ limits: { ip: { max: 100 } } });
  t.after(() => app.close());

  const cases = [
    [{ destination: '12345' }, { destination: 'invalid_phone' }, 'Use an international number, like +47 912 34 567.'],
    [{ channel: 'email', destination: 'sanna@example' }, { destination: 'invalid_email' }, 'That email address does not look complete.'],
    [{ channel: 'email', destination: '<b>@x.example' }, { destination: 'invalid_email' }, 'That email address does not look complete.'],
    [{ destination: undefined }, { destination: 'required' }, 'Enter where the link should go.'],
    [{ destination: `+47${'1'.repeat(260)}` }, { destination: 'too_long' }, 'That address is too long.'],
    [{ platform: 'watch' }, { platform: 'invalid_platform' }, 'Choose Phone or Tablet.'],
    [{ channel: 'fax', platform: 7 }, { channel: 'invalid_channel', platform: 'invalid_platform' }, 'Choose SMS or email.'],
  ];
  for (const [override, fields, message] of cases) {
    const res = await send({ ...validRequest, ...override });
    assert.equal(res.statusCode, 400, JSON.stringify(override));
    assert.deepEqual(res.json(), { ok: false, error: 'validation', message, fields });
  }
  assert.equal(deliveries.length, 0);
});

test('malformed, non-object and oversized bodies get the validation error shape', async (t) => {
  const { app, send } = await setup();
  t.after(() => app.close());

  const bodies = [
    app.inject({ method: 'POST', url: '/api/app-link', headers: { 'content-type': 'application/json' }, payload: '{"channel":' }),
    app.inject({ method: 'POST', url: '/api/app-link', headers: { 'content-type': 'text/plain' }, payload: 'hello' }),
    send([validRequest]),
    send({ ...validRequest, notes: 'x'.repeat(5000) }),
  ];
  for (const res of await Promise.all(bodies)) {
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { ok: false, error: 'validation', message: 'Send the request as a JSON object.', fields: {} });
  }
});

test('the sixth request from one IP within ten minutes is rate limited', async (t) => {
  const { app, send } = await setup();
  t.after(() => app.close());

  for (let i = 0; i < 5; i++) {
    const res = await send({ ...validRequest, destination: `+479123450${i}` });
    assert.equal(res.statusCode, 200);
  }
  const res = await send({ ...validRequest, destination: '+4791234509' });

  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['retry-after'], '600');
  assert.deepEqual(res.json(), {
    ok: false,
    error: 'rate_limited',
    message: 'Too many requests. Try again in 10 minutes.',
    retryAfterSeconds: 600,
  });
});

test('the IP limit is configurable through the app factory', async (t) => {
  const { app, send } = await setup({ limits: { ip: { max: 1, windowMs: 60_000 } } });
  t.after(() => app.close());

  assert.equal((await send(validRequest)).statusCode, 200);
  const res = await send({ ...validRequest, destination: '+4791234500' });

  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['retry-after'], '60');
  assert.equal(res.json().message, 'Too many requests. Try again in 1 minute.');
});

test('one recipient gets at most three links per hour, regardless of formatting', async (t) => {
  const { app, deliveries, send } = await setup({ limits: { ip: { max: 100 } } });
  t.after(() => app.close());

  for (const destination of ['+4791234532', '+47 912 34 532', '+47.912.34.532']) {
    assert.equal((await send({ ...validRequest, destination })).statusCode, 200);
  }
  const res = await send(validRequest);

  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['retry-after'], '3600');
  assert.equal(res.json().retryAfterSeconds, 3600);
  assert.equal(deliveries.length, 3);
});

test('a filled honeypot looks successful but sends nothing', async (t) => {
  const { app, deliveries, send } = await setup();
  t.after(() => app.close());

  const res = await send({ ...validRequest, company: 'Orbital Supplies Ltd' });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), {
    ok: true,
    channel: 'sms',
    platform: 'tablet',
    maskedDestination: '+47 ••• •• 532',
    message: 'It can take up to a minute to arrive.',
  });
  assert.equal(deliveries.length, 0);
});

test('invisible characters are stripped and unknown fields ignored', async (t) => {
  const { app, deliveries, send } = await setup();
  t.after(() => app.close());

  const [zeroWidthSpace, nul, rightToLeftOverride] = [0x200b, 0x0, 0x202e].map((code) => String.fromCodePoint(code));
  const destination = `${zeroWidthSpace}+47${nul} 912 34${rightToLeftOverride} 532\n`;
  const res = await send({ ...validRequest, destination, referrer: '<script>' });

  assert.equal(res.statusCode, 200);
  assert.equal(deliveries[0].destination, '+4791234532');
  assert.doesNotMatch(res.body, /script/);
});

test('unknown routes answer with the JSON error shape', async (t) => {
  const { app } = await setup();
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/api/nope' });

  assert.equal(res.statusCode, 404);
  assert.equal(res.json().ok, false);
  assert.equal(res.json().error, 'not_found');
});
