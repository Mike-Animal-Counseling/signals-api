import 'dotenv/config';
import http from 'node:http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { loadSecurity, createBudgets, verifyToken } from './security.js';
const config = loadSecurity();
mongoose.set('strictQuery', true);
if (!process.env.MONGO_URI) throw new Error('MONGO_URI required');
await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
const User = mongoose.model('User', new mongoose.Schema({ email: { type: String, unique: true, required: true }, password_hash: { type: String, required: true } }, { timestamps: true }));
const schema = new mongoose.Schema({ user_id: { type: String, required: true }, signal_type: { type: String, required: true }, timestamp: { type: Date, required: true }, payload: mongoose.Schema.Types.Mixed }, { timestamps: true });
schema.index({ user_id: 1, timestamp: -1 });
const Signal = mongoose.model('Signal', schema), budgets = await createBudgets();
const app = createApp({ User, Signal, budgets, config, io: { to: room => io.to(room) } });
const server = http.createServer(app);
server.requestTimeout = 30000; server.headersTimeout = 10000; server.maxRequestsPerSocket = 100;
const io = new Server(server, { maxHttpBufferSize: 16384, cors: { origin: config.origins }, allowRequest: (req, cb) => cb(null, !!req.headers.origin && config.origins.includes(req.headers.origin)) });
io.use(async (socket, next) => {
  try {
    const claims = verifyToken(socket.handshake.auth?.token, config), user = await User.findById(claims.sub);
    if (!user || user.email !== claims.email || !await budgets.take(`socket:${claims.sub}`, 30, 60000)) throw new Error();
    socket.data.userId = String(user._id); socket.data.exp = claims.exp; next();
  } catch { next(new Error('unauthorized')); }
});
io.on('connection', socket => {
  socket.join(`user:${socket.data.userId}`);
  const timer = setTimeout(() => socket.disconnect(true), Math.max(0, socket.data.exp * 1000 - Date.now()));
  timer.unref(); socket.on('disconnect', () => clearTimeout(timer));
});
server.listen(Number(process.env.PORT || 4000), config.production ? '0.0.0.0' : '127.0.0.1', () => console.log('Signals API ready'));
async function stop() { io.close(); server.close(); await budgets.close(); await mongoose.disconnect(); }
process.once('SIGTERM', stop); process.once('SIGINT', stop);
