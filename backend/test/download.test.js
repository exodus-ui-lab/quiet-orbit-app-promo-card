import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { buildApp } from '../src/app.js';

describe('GET /download/:platform', () => {
  let app;
  before(async () => {
    app = await buildApp();
  });
  after(() => app.close());

  for (const platform of ['phone', 'tablet']) {
    test(`${platform} redirects to the same link GET /api/app serves`, async () => {
      const links = (await app.inject({ method: 'GET', url: '/api/app' })).json().links;
      const res = await app.inject({ method: 'GET', url: `/download/${platform}` });

      assert.equal(res.statusCode, 302);
      assert.equal(res.headers.location, links[platform]);
    });
  }

  test('unknown platforms are not found and never redirect', async () => {
    for (const platform of ['watch', 'toString', '%2F%2Fevil.example']) {
      const res = await app.inject({ method: 'GET', url: `/download/${platform}` });

      assert.equal(res.statusCode, 404, platform);
      assert.equal(res.headers.location, undefined);
    }
  });
});
