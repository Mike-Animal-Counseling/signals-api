import { createHash, randomUUID } from 'node:crypto';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { createClient } from 'redis';

export function loadSecurity(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const secret = env.JWT_SECRET || '';
  if (secret.length < 32 || /replace|change.?me|dev.secret|example|your.secret/i.test(secret)) throw new Error('Set JWT_SECRET to a newly generated secret of at least 32 characters');
  const origins = (env.CORS_ORIGIN || (production ? '' : 'http://localhost:5173')).split(',').map(s => s.trim()).filter(Boolean);
  if (!origins.length || origins.some(s => {
    try { const u = new URL(s); return u.origin !== s || u.username || u.password || (production && u.protocol !== 'https:') || !['http:', 'https:'].includes(u.protocol); }
    catch { return true; }
  })) throw new Error('Set explicit CORS_ORIGIN origins; production requires HTTPS');
  if (production && (!env.REDIS_URL || !env.REDIS_URL.startsWith('rediss://'))) throw new Error('Production requires REDIS_URL with TLS (rediss://)');
  const proxy = env.TRUST_PROXY || '';
  return { production, secret, origins, trustProxy: /^\d{1,2}$/.test(proxy) ? Number(proxy) : proxy || false };
}
export function issueToken(user, config) {
  return jwt.sign({ email: user.email }, config.secret, { algorithm: 'HS256', subject: String(user._id), issuer: 'signals-api', audience: 'signals-api', expiresIn: '15m', jwtid: randomUUID() });
}
export function verifyToken(token, config) {
  const payload = jwt.verify(token, config.secret, { algorithms: ['HS256'], issuer: 'signals-api', audience: 'signals-api' });
  if (typeof payload.sub !== 'string' || !/^[a-f\d]{24}$/i.test(payload.sub) || typeof payload.email !== 'string' || typeof payload.jti !== 'string') throw new Error('Invalid identity');
  return payload;
}
// Production budgets are atomic and shared across all instances. Redis failure
// fails closed; bounded memory is only available for tests/local development.
export async function createBudgets(env = process.env) {
  let client;
  const memory = new Map();
  if (env.REDIS_URL) {
    client = createClient({ disableOfflineQueue: true, commandsQueueMaxLength: 500, commandOptions: { timeout: 5000 }, url: env.REDIS_URL, socket: { connectTimeout: 5000, reconnectStrategy: retries => retries > 2 ? new Error('Redis unavailable') : 100 } });
    client.on('error', () => {}); await client.connect();
  } else if (env.NODE_ENV === 'production') throw new Error('Redis required');
  const script = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); end; return n";
  return {
    async take(key, limit, windowMs) {
      const id = 'signals:budget:' + createHash('sha256').update(key).digest('hex');
      if (client) {
        if (!client.isReady) throw new Error('Budget unavailable');
        return Number(await client.eval(script, { keys: [id], arguments: [String(windowMs)] })) <= limit;
      }
      const now = Date.now();
      for (const [k, v] of memory) if (v.until <= now) memory.delete(k);
      if (!memory.has(id) && memory.size >= 10000) return false;
      const bucket = memory.get(id) || { count: 0, until: now + windowMs };
      bucket.count++; memory.set(id, bucket); return bucket.count <= limit;
    },
    async close() { if (client?.isOpen) await client.quit(); },
  };
}
export const securityHeaders = helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }, referrerPolicy: { policy: 'no-referrer' } });
export function rateLimit(budgets, namespace, limit, windowMs = 60000, identify = req => req.ip) {
  return async (req, res, next) => {
    try {
      if (!await budgets.take(`${namespace}:${identify(req)}`, limit, windowMs)) { res.set('Retry-After', String(Math.ceil(windowMs / 1000))); return res.status(429).json({ error: 'Too many requests' }); }
      next();
    } catch { res.status(503).json({ error: 'Service temporarily unavailable' }); }
  };
}
