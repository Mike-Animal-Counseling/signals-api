# Real‑Time Signal Processing API (Coherence Protocol)

**Live Demo:** `https://signals-api-frontend-028322.netlify.app` (frontend) → talks to `https://signals-api-z3n8.onrender.com` (backend)  
**Repo:** `https://github.com/Mike-Animal-Counseling/signals-api`

This project implements a real‑time signal pipeline with JWT auth, REST APIs, Socket.IO streaming, Docker/Compose, and a minimal React dashboard.

## Tech Stack

- **Backend:** Node.js, Express, Socket.IO, MongoDB (Mongoose), JWT, bcrypt, CORS, morgan
- **Frontend:** React (Vite), Axios, Socket.IO client, Day.js
- **Infra:** Docker & docker‑compose, Render (Backend), Netlify (Frontend)

---

## Quick Start (Local)

### 1) Backend

Create `./.env` from the example below and fill in values:

```env
MONGO_URI=<your-mongodb-connection-string>
JWT_SECRET=<your-strong-jwt-secret>
CORS_ORIGIN=http://localhost:5173,https://signals-api-frontend-028322.netlify.app
PORT=4000
```

Install & run:

```bash
cd signals-api && cd backend
npm install
npm run dev
```

Health check:

```bash
curl http://localhost:4000/api/health
```

### 2) Frontend (Vite, another terminal)

Create `./frontend/.env`:

```env
VITE_API_URL=http://localhost:4000
```

Then:

```bash
cd signals-api && cd frontend
npm install
npm run dev
# open http://localhost:5173
```

### 3) Docker (Containization)

A sample `docker-compose.yml` can run API + Mongo (+ optionally the frontend). From the repo root:

```bash
docker compose up --build
```

---

## Architecture
<img width="701" height="411" alt="Coherence Signals API Archi Diagram drawio" src="https://github.com/user-attachments/assets/956d8237-8f81-4e3f-ae90-7104709ef654" />


````

**Key flows**

- Users register/login → JWT issued (expires in 7 days).
- Authenticated clients call REST to create/get/delete signals.
- On create/delete, server broadcasts to all clients through `signal:new` / `signal:delete` via Socket.IO.
- Dashboard shows live updates and applies filters by type or time.

---

## API Reference

Base URL: `https://signals-api-z3n8.onrender.com` (local: `http://localhost:4000`)

### Auth

**POST `/api/auth/register`**

```json
{ "email": "march1@yahoo.com", "password": "123123123" }
````

- 201 → `{ id, email }`
- 400/409 → `{ error: "..." }`

**POST `/api/auth/login`**

```json
{ "email": "march1@yahoo.com", "password": "123123123" }
```

- 200 → `{ "token": "<JWT>" }` (Authorization: `Bearer <JWT>` for all protected routes)
- 400/401 → `{ error: "..." }`

**GET `/api/health`**

- 200 → `{ ok: true }`

### Signals (JWT required)

**POST `/api/signals`**

```json
{
  "signal_type": "demo",
  "timestamp": "2025-08-013T12:00:00.000Z",
  "payload": { "note": "This is a sample payload" }
}
```

- 201 → the created signal document
- Broadcasts `signal:new`

**GET `/api/signals?type=demo&from=ISO&to=ISO&limit=50`**

- Filters:
  - `type` (exact match on `signal_type` like demo)
  - `from` / `to` (ISO datetimes)
  - `limit` (max 500)
- 200 → array of signals sorted by `timestamp` desc

**DELETE `/api/signals/:id`**

- Only the account owner can delete the signals they created.
- 200 → `{ ok: true }` and broadcasts `signal:delete`

### WebSocket (Socket.IO)

Client connects to the API URL with auth:

```js
import { io } from "socket.io-client";
const socket = io(API_BASE, {
  auth: { token: "<JWT>" },
  transports: ["websocket"],
});
socket.on("signal:new", (doc) => console.log("NEW", doc));
socket.on("signal:delete", (msg) => console.log("DELETE", msg));
```

## Deployment

### Render (Backend)

1. Create a **Web Service** pointing to your API code.
2. Set env vars:
   - `MONGO_URI` – use Mongo conncection string you self-designed
   - `JWT_SECRET` – strong random string for security.
   - `CORS_ORIGIN` – include the Netlify domain
   - `PORT` – 4000
3. Make sure your server listens on `process.env.PORT`.
4. Confirm websockets work.

### Netlify (Frontend)

1. Point Netlify to the frontend project (Vite).
2. Set a build env var:
   - `VITE_API_URL=https://sample-api.onrender.com` from render
3. Redeploy. Validate login/register and that signals stream in real‑time.
