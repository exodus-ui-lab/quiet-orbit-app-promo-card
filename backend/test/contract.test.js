import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, test } from 'node:test';

import { buildApp } from '../src/app.js';

const demo = JSON.parse(await readFile(new URL('../../demo.json', import.meta.url), 'utf8'));

// Rebuild the request the page sends during the demo: the typed number, normalized the way the page does,
// for the platform that was clicked, on the default SMS channel with the honeypot left empty.
const typedDestination = demo.steps.find((step) => step.action === 'type' && step.selector === '#destination').text;
const clickedPlatform = demo.steps.findLast((step) => step.action === 'click' && step.selector.includes('platform-'));
const demoRequests = {
  'GET /api/app': {},
  'POST /api/app-link': {
    payload: {
      channel: 'sms',
      destination: typedDestination.replace(/[\s().-]/g, ''),
      platform: clickedPlatform.selector.match(/platform-(\w+)/)[1],
      company: '',
    },
  },
};

/** Replaces every leaf with its JSON type, so two bodies compare by structure only. */
function shape(value) {
  if (Array.isArray(value)) return value.map(shape);
  if (value === null) return 'null';
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, shape(child)]));
  return typeof value;
}

describe('demo mock responses', () => {
  let app;
  before(async () => {
    app = await buildApp();
  });
  after(() => app.close());

  for (const [key, mock] of Object.entries(demo.mockResponses)) {
    test(`${key} answers like the demo mock`, async () => {
      const [method, url] = key.split(' ');
      assert.ok(demoRequests[key], `no demo request defined for ${key}`);

      const res = await app.inject({ method, url, headers: { accept: 'application/json' }, ...demoRequests[key] });

      assert.equal(res.statusCode, mock.status);
      assert.match(res.headers['content-type'], /^application\/json; charset=utf-8/);
      assert.deepEqual(shape(res.json()), shape(mock.body));
      assert.deepEqual(res.json(), mock.body);
    });
  }
});

describe('response headers', () => {
  let app;
  before(async () => {
    app = await buildApp();
  });
  after(() => app.close());

  test('GET /api/app is cacheable for five minutes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/app' });
    assert.equal(res.headers['cache-control'], 'public, max-age=300');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['referrer-policy'], 'same-origin');
  });

  test('POST /api/app-link is never cached', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/app-link', payload: demoRequests['POST /api/app-link'].payload });
    assert.equal(res.headers['cache-control'], 'no-store');
  });

  test('cross-origin callers get no CORS grant by default', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/app', headers: { origin: 'https://elsewhere.example' } });
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });
});
