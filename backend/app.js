import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { rateLimit as expressRateLimit } from 'express-rate-limit';
import { issueToken, verifyToken, securityHeaders, rateLimit } from './security.js';
const invalid = (res, message = 'Invalid request') => res.status(400).json({ error: message });
const normalizeEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value.trim().toLowerCase() : null;
const validPassword = value => typeof value === 'string' && value.length >= 12 && Buffer.byteLength(value) <= 72;
const validId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
export function createApp({ User, Signal, budgets, config, io }) {
  const app = express();
  app.disable('x-powered-by'); app.set('trust proxy', config.trustProxy); app.use(securityHeaders);
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (config.production && !req.secure && req.path !== '/api/health') return res.status(426).json({ error: 'HTTPS required' });
    const origin = req.get('Origin');
    if (origin && !config.origins.includes(origin)) return res.status(403).json({ error: 'Origin not allowed' }); next();
  });
  app.use(cors({ origin: config.origins, methods: ['GET', 'POST', 'DELETE'], allowedHeaders: ['Authorization', 'Content-Type'] }));
  // Per-process overload protection complements the cross-instance Redis budgets.
  app.use(expressRateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use(rateLimit(budgets, 'ip', 120)); app.use(express.json({ limit: '16kb', strict: true }));
  const auth = async (req, res, next) => {
    try {
      const header = req.get('Authorization') || '';
      if (!header.startsWith('Bearer ')) throw new Error();
      const claims = verifyToken(header.slice(7), config), user = await User.findById(claims.sub);
      if (!user || user.email !== claims.email) throw new Error();
      req.user = { id: String(user._id), email: user.email }; next();
    } catch { res.status(401).json({ error: 'Authentication required' }); }
  };
  const authBudget = rateLimit(budgets, 'login-ip', 10, 15 * 60000);
  const accountBudget = rateLimit(budgets, 'login-account', 10, 15 * 60000, req => normalizeEmail(req.body?.email) || 'invalid');
  app.post('/api/auth/register', authBudget, accountBudget, async (req, res) => {
    const email = normalizeEmail(req.body?.email), password = req.body?.password;
    if (!email || !validPassword(password)) return invalid(res, 'Use a valid email and a password of 12–72 UTF-8 bytes');
    if (await User.findOne({ email })) return res.status(409).json({ error: 'Unable to register this account' });
    const user = await User.create({ email, password_hash: await bcrypt.hash(password, 12) }); res.status(201).json({ id: String(user._id), email: user.email });
  });
  app.post('/api/auth/login', authBudget, accountBudget, async (req, res) => {
    const email = normalizeEmail(req.body?.email), password = req.body?.password;
    if (!email || typeof password !== 'string' || Buffer.byteLength(password) > 72) return res.status(401).json({ error: 'Invalid credentials' });
    const user = await User.findOne({ email });
    const dummy = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYJYGRklB.kAEOWBQVjnWEZWVjx7njcK';
    const ok = await bcrypt.compare(password, user?.password_hash || dummy);
    if (!user || !ok) return res.status(401).json({ error: 'Invalid credentials' }); res.json({ token: issueToken(user, config), expiresIn: 900 });
  });
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/signals', auth, rateLimit(budgets, 'user', 60, 60000, req => req.user.id));
  app.post('/api/signals', async (req, res) => {
    const { signal_type, timestamp, payload = {} } = req.body || {};
    if (typeof signal_type !== 'string' || !/^[\w -]{1,80}$/.test(signal_type) || typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp)) || !payload || Array.isArray(payload) || typeof payload !== 'object' || JSON.stringify(payload).length > 8192) return invalid(res);
    const doc = await Signal.create({ user_id: req.user.email, signal_type, timestamp: new Date(timestamp), payload }); io?.to(`user:${req.user.id}`).emit('signal:new', doc); res.status(201).json(doc);
  });
  app.get('/api/signals', async (req, res) => {
    const { type, from, to, limit = '50' } = req.query;
    if ((type !== undefined && (typeof type !== 'string' || type.length > 80)) || (from !== undefined && (typeof from !== 'string' || !Number.isFinite(Date.parse(from)))) || (to !== undefined && (typeof to !== 'string' || !Number.isFinite(Date.parse(to)))) || typeof limit !== 'string' || !/^\d{1,3}$/.test(limit) || +limit < 1 || +limit > 500) return invalid(res);
    const query = { user_id: req.user.email };
    if (type) query.signal_type = String(type);
    if (from || to) { query.timestamp = {}; if (from) query.timestamp.$gte = new Date(from); if (to) query.timestamp.$lte = new Date(to); }
    res.json(await Signal.find(query).sort({ timestamp: -1 }).limit(+limit));
  });
  app.delete('/api/signals/:id', async (req, res) => {
    if (!validId(req.params.id)) return invalid(res);
    const doc = await Signal.findOneAndDelete({ _id: req.params.id, user_id: req.user.email });
    if (!doc) return res.status(404).json({ error: 'Not found' }); io?.to(`user:${req.user.id}`).emit('signal:delete', { _id: req.params.id }); res.json({ ok: true });
  });
  app.use((error, _req, res, _next) => {
    const status = error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : error.code === 11000 ? 409 : 500;
    res.status(status).json({ error: status === 500 ? 'Request failed' : 'Invalid request' });
  });
  return app;
}
