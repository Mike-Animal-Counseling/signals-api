# Real‑Time Signal Processing API (Coherence Protocol)

[Open Dashboard](https://signals-api-frontend-028322.netlify.app) · [Run Locally](#run-locally) · [Architecture](#architecture) · [API Reference](#api-reference)

The hosted dashboard connects to a separate Render API. If the backend is unavailable, use the local setup below to run the complete pipeline.

## Overview
This project implements a real‑time signal pipeline with JWT auth, REST APIs, Socket.IO streaming, Docker/Compose, and a minimal React dashboard.

## Tech Stack

- **Backend:** Node.js, Express, Socket.IO, MongoDB (Mongoose), JWT, bcrypt, CORS, morgan
- **Frontend:** React (Vite), Axios, Socket.IO client, Day.js
- **Infra:** Docker & docker‑compose, Render (Backend), Netlify (Frontend)

## Run Locally

```bash
git clone https://github.com/Mike-Animal-Counseling/signals-api.git
cd signals-api
```

Start the backend and frontend in separate terminals from the repository root.

### 1) Backend

Use Node.js 24 or newer, as required by `backend/package.json`. Create `backend/.env` from `backend/.env.example` and fill in the values below. The backend loads this file when started from the `backend` directory.

Set `JWT_SECRET` to a newly generated random value of at least 32 characters; the placeholder below is not a usable secret:

```env
MONGO_URI=<your-mongodb-connection-string>
JWT_SECRET=<your-strong-jwt-secret>
CORS_ORIGIN=http://localhost:5173,https://signals-api-frontend-028322.netlify.app
PORT=4000
```

Install & run:

```bash
cd backend
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
cd frontend
npm install
npm run dev
# open http://localhost:5173
```

### 3) Docker

The [`docker-compose.yml`](docker-compose.yml) starts MongoDB, the API, and the frontend. From the repo root:

```bash
docker compose up --build
```

---

## Architecture
<img width="701" height="411" alt="Coherence Signals API Archi Diagram drawio" src="https://github.com/user-attachments/assets/956d8237-8f81-4e3f-ae90-7104709ef654" />


**Key flows**

- Users register, then log in → JWT issued (expires in 15 minutes).
- Authenticated clients call REST to create/get/delete signals.
- On create/delete, the server emits `signal:new` / `signal:delete` to the authenticated user's `user:<id>` Socket.IO room.
- Dashboard shows live updates and applies filters by type or time.

---

## API Reference

Use `http://localhost:4000` for local development. The hosted backend address is `https://signals-api-z3n8.onrender.com`.

### Auth

**POST `/api/auth/register`**

```json
{ "email": "developer@example.com", "password": "example-passphrase-123" }
```

- 201 → `{ id, email }`
- 400/409 → `{ error: "..." }`

**POST `/api/auth/login`**

```json
{ "email": "developer@example.com", "password": "example-passphrase-123" }
```

- 200 → `{ "token": "<JWT>", "expiresIn": 900 }` (Authorization: `Bearer <JWT>` for all protected routes)
- 401 → `{ error: "..." }` for invalid login credentials

**GET `/api/health`**

- 200 → `{ ok: true }`

### Signals (JWT required)

**POST `/api/signals`**

```json
{
  "signal_type": "demo",
  "timestamp": "2025-08-13T12:00:00.000Z",
  "payload": { "note": "This is a sample payload" }
}
```

- 201 → the created signal document
- Emits `signal:new` to the authenticated user's room

**GET `/api/signals?type=demo&from=ISO&to=ISO&limit=50`**

- Filters:
  - `type` (exact match on `signal_type` like demo)
  - `from` / `to` (ISO datetimes)
  - `limit` (max 500)
- 200 → array of signals sorted by `timestamp` desc

**DELETE `/api/signals/:id`**

- Only the account owner can delete the signals they created.
- 200 → `{ ok: true }` and emits `signal:delete` to the authenticated user's room

### WebSocket (Socket.IO)

Client connects to the API URL with auth:

The server validates the JWT during the Socket.IO handshake and joins the connection to that user's room. Other accounts do not receive its signal events. When the JWT expires, the server disconnects the socket; a new connection must use a valid token.

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
   - `MONGO_URI` – use your authenticated MongoDB connection string
   - `JWT_SECRET` – strong random string for security.
   - `CORS_ORIGIN` – include the Netlify domain
   - `PORT` – 4000
3. Make sure your server listens on `process.env.PORT`.
4. Confirm websockets work.

### Netlify (Frontend)

1. Point Netlify to the frontend project (Vite).
2. Set a build env var:
   - `VITE_API_URL` – the HTTPS origin of your deployed Render API
3. Redeploy. Validate login/register and that signals stream in real‑time.

## Security and deployment

Read the [security policy](SECURITY.md) and [production requirements](docs/PRODUCTION_SECURITY.md) before deployment.
