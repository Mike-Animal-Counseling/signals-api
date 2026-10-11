import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { loadSecurity, issueToken, createBudgets } from '../security.js';
const config = loadSecurity({ JWT_SECRET: 'test-only-' + 'a'.repeat(64), NODE_ENV: 'test' });
const user = { _id: 'a'.repeat(24), email: 'owner@example.invalid' };
function fixture(budgets = { take: async () => true }) {
  const queries = [];
  const User = { findById: async id => id === user._id ? user : null, findOne: async () => null };
  const Signal = { find(q) { queries.push(q); return { sort() { return this; }, limit: async () => [] }; }, findOneAndDelete: async q => { queries.push(q); return null; } };
  return { app: createApp({ User, Signal, budgets, config }), queries };
}
test('startup rejects missing/weak secrets and unsafe production origins', () => {
  assert.throws(() => loadSecurity({}));
  assert.throws(() => loadSecurity({ JWT_SECRET: 'test-only-' + 'a'.repeat(64), NODE_ENV: 'production', CORS_ORIGIN: '*', REDIS_URL: 'rediss://example.invalid' }));
  assert.throws(() => loadSecurity({ JWT_SECRET: 'test-only-' + 'a'.repeat(64), NODE_ENV: 'production', CORS_ORIGIN: 'https://example.invalid' }));
});
test('anonymous and legacy tokens cannot access private signals', async () => {
  const { app } = fixture();
  assert.equal((await request(app).get('/api/signals')).status, 401);
  const legacy = jwt.sign({ email: user.email, userId: user._id }, config.secret);
  assert.equal((await request(app).get('/api/signals').auth(legacy, { type: 'bearer' })).status, 401);
});
test('list and delete enforce authenticated ownership', async () => {
  const { app, queries } = fixture(), token = issueToken(user, config);
  assert.equal((await request(app).get('/api/signals').auth(token, { type: 'bearer' })).status, 200);
  assert.equal(queries[0].user_id, user.email);
  assert.equal((await request(app).delete('/api/signals/' + 'b'.repeat(24)).auth(token, { type: 'bearer' })).status, 404);
  assert.equal(queries[1].user_id, user.email);
});
test('rejects NoSQL-shaped inputs, oversized JSON and negative limits', async () => {
  const { app } = fixture(), token = issueToken(user, config);
  assert.equal((await request(app).post('/api/auth/login').send({ email: { $ne: null }, password: 'valid-password' })).status, 401);
  assert.equal((await request(app).get('/api/signals?limit=-1').auth(token, { type: 'bearer' })).status, 400);
  assert.equal((await request(app).post('/api/signals').auth(token, { type: 'bearer' }).send({ payload: 'x'.repeat(20000) })).status, 413);
});
test('rejects untrusted browser origins and fails closed when shared budgets fail', async () => {
  assert.equal((await request(fixture().app).get('/api/health').set('Origin', 'https://attacker.invalid')).status, 403);
  const { app } = fixture({ take: async () => { throw new Error('offline'); } });
  assert.equal((await request(app).get('/api/signals')).status, 503);
});
test('local budget denies requests past the configured allowance', async () => {
  const budgets = await createBudgets({ NODE_ENV: 'test' });
  assert.equal(await budgets.take('one', 1, 60000), true);
  assert.equal(await budgets.take('one', 1, 60000), false);
  await budgets.close();
});
