import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import morgan from "morgan";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (process.env.CORS_ORIGIN || "http://localhost:5173").split(","),
    credentials: true,
  },
});

// DataBase
mongoose.set("strictQuery", true);
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    const port = process.env.PORT || 4000;
    server.listen(port, () => console.log(`API is running on port ${port}`));
  })
  .catch((err) => {
    console.error("Mongo connection error:", err.message);
    process.exit(1);
  });

// Database Schema
const SignalSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, index: true },
    signal_type: { type: String, required: true, index: true },
    timestamp: { type: Date, required: true, index: true },
    payload: { type: Object, default: {} },
  },
  { timestamps: true }
);
const Signal = mongoose.model("Signal", SignalSchema);

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, required: true },
    password_hash: { type: String, required: true },
  },
  { timestamps: true }
);
const User = mongoose.model("User", UserSchema);

app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || "http://localhost:5173").split(","),
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan("dev"));

// Auth Middleware
const auth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { userId, email }
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// Push io to req for broadcasting
app.use((req, _res, next) => {
  req.io = io;
  next();
});

//Auth Routes
app.post("/api/auth/register", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "Missing email or password" });
  if (password.length < 8)
    return res.status(400).json({ error: "Password too short for security" });

  const existing = await User.findOne({ email });
  if (existing)
    return res.status(409).json({ error: "Email is already registered" });

  const password_hash = await bcrypt.hash(password, 10);
  const user = await User.create({ email, password_hash });
  return res.status(201).json({ id: user._id, email: user.email });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "Missing email or password" });

  const user = await User.findOne({ email });
  if (!user)
    return res
      .status(401)
      .json({ error: "Account does not exist. Please register first!" });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials." });

  const token = jwt.sign({ userId: user._id, email }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
  return res.json({ token });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Signals Routes (proteced by JWT)
app.post("/api/signals", auth, async (req, res) => {
  const { signal_type, timestamp, payload } = req.body || {};
  if (!signal_type || !timestamp)
    return res
      .status(400)
      .json({ error: "Missing fields: signal_type, timestamp" });

  const doc = await Signal.create({
    user_id: req.user.email,
    signal_type,
    timestamp: new Date(timestamp),
    payload: payload || {},
  });

  req.io.emit("signal:new", doc);
  return res.status(201).json(doc);
});

app.get("/api/signals", auth, async (req, res) => {
  const { type, from, to, limit = 50 } = req.query;
  const q = {};
  if (type) q.signal_type = type;
  if (from || to) {
    q.timestamp = {};
    if (from) q.timestamp.$gte = new Date(from);
    if (to) q.timestamp.$lte = new Date(to);
  }
  const docs = await Signal.find(q)
    .sort({ timestamp: -1 })
    .limit(Math.min(parseInt(limit, 10) || 50, 500));
  return res.json(docs);
});

// Delete (owner-only, convenient for testing)
app.delete("/api/signals/:id", auth, async (req, res) => {
  const { id } = req.params;
  const doc = await Signal.findById(id);
  if (!doc) return res.status(404).json({ error: "Not found" });
  if (doc.user_id !== req.user.email)
    return res
      .status(403)
      .json({ error: "Forbidden. This is not your signal." });
  await Signal.deleteOne({ _id: id });
  req.io.emit("signal:delete", { _id: id });
  return res.json({ ok: true });
});

// Socket.IO Auth
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("unauthorized"));
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  console.log("Socket connected", socket.id);
});
