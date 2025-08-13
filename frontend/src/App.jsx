import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import dayjs from "dayjs";

// Backend URLs
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";
const API = `${API_BASE}/api`;
const api = axios.create({ baseURL: API_BASE });

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [authView, setAuthView] = useState("choice");
  const [email, setEmail] = useState(localStorage.getItem("email") || "");
  const [password, setPassword] = useState("");

  const [signals, setSignals] = useState([]);
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const socketRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    fetchSignals();

    const socket = io(API_BASE, {
      auth: { token },
      transports: ["websocket"],
    });
    // make sure we don't stack multiple handlers
    socket.removeAllListeners("signal:new");
    socket.on("signal:new", upsertSignal);

    socket.removeAllListeners("signal:delete");
    socket.on("signal:delete", ({ _id }) => {
      setSignals((prev) => prev.filter((s) => (s._id === _id ? false : true)));
    });

    socketRef.current = socket;
    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Ensure we never keep duplicates with the same _id
  const upsertSignal = (sig) =>
    setSignals((prev) =>
      prev.some((s) => s._id === sig._id) ? prev : [sig, ...prev]
    );

  const fetchSignals = async () => {
    try {
      const params = {};
      if (type) params.type = type;
      if (from) params.from = new Date(from).toISOString();
      if (to) params.to = new Date(to).toISOString();
      const { data } = await api.get(`${API}/signals`, { params });
      setSignals(data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const onRegister = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.post(`${API}/auth/register`, { email, password });
      setAuthView("login");
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const onLogin = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const { data } = await api.post(`${API}/auth/login`, { email, password });
      localStorage.setItem("token", data.token);
      setToken(data.token);
      localStorage.setItem("email", email);
      setEmail(email);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken("");
    setSignals([]);
    setError("");
    setAuthView("choice");
  };

  const createSignal = async () => {
    setError("");
    try {
      await api.post(`${API}/signals`, {
        signal_type: type || "demo",
        timestamp: new Date().toISOString(),
        payload: { note: "this is the payload" },
      });
      // do not touch state, wait for Socket.io
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const removeSignal = async (id) => {
    setError("");
    try {
      await api.delete(`${API}/signals/${id}`);
      setSignals((prev) => prev.filter((s) => s._id !== id));
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const count = useMemo(() => signals.length, [signals]);

  // global styles
  const page = {
    display: "flex",
    justifyContent: "center",
    minHeight: "100vh",
    width: "100%",
  };
  const card = {
    width: "100%",
    maxWidth: 420,
    margin: "56px 16px",
    background: "#fff",
    borderRadius: "var(--radius)",
    boxShadow: "var(--shadow)",
    padding: 24,
    fontFamily: "var(--font)",
    color: "var(--text)",
  };
  const bigCard = {
    width: "100%",
    maxWidth: 900,
    margin: "40px 16px",
    background: "#fff",
    borderRadius: "var(--radius)",
    boxShadow: "var(--shadow)",
    padding: 24,
    fontFamily: "var(--font)",
    color: "var(--text)",
  };
  const h1 = { margin: 0, fontSize: 22, fontWeight: 600 };
  const sub = { margin: "6px 0 20px", color: "var(--muted)", fontSize: 14 };
  const input = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    outline: "none",
  };
  const btnRow = {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginTop: 12,
  };
  const btnPrimary = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 9999,
    border: "1px solid var(--primary)",
    background: "var(--primary)",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
  };
  const btnOutlined = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 9999,
    border: "1px solid var(--border)",
    background: "#fff",
    color: "var(--text)",
    fontWeight: 600,
    cursor: "pointer",
  };
  const link = {
    color: "var(--primary)",
    cursor: "pointer",
    textDecoration: "none",
    fontWeight: 600,
  };

  // auth screens (like workday version)
  if (!token) {
    if (authView === "choice") {
      return (
        <div style={page}>
          <div style={card}>
            <h1 style={h1}>Welcome To Signal Transmitter</h1>
            <p style={sub}>Choose how you want to continue</p>
            <p style={sub}></p>
            <div style={btnRow}>
              <button style={btnPrimary} onClick={() => setAuthView("login")}>
                Sign in
              </button>
              <button
                style={btnOutlined}
                onClick={() => setAuthView("register")}
              >
                Create account
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (authView === "login") {
      return (
        <div style={page}>
          <div style={card}>
            <h1 style={h1}>Sign in</h1>
            <p style={sub}></p>
            <form onSubmit={onLogin} style={{ display: "grid", gap: 12 }}>
              <input
                style={input}
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                style={input}
                placeholder="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button style={btnPrimary} type="submit">
                Sign in
              </button>
            </form>
            {error && (
              <p style={{ color: "crimson", marginTop: 10 }}>{error}</p>
            )}
            <div
              style={{
                marginTop: 16,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <a style={link} onClick={() => setAuthView("choice")}>
                ← Back
              </a>
              <span>
                New here?{" "}
                <a style={link} onClick={() => setAuthView("register")}>
                  Create an account
                </a>
              </span>
            </div>
          </div>
        </div>
      );
    }

    // register
    return (
      <div style={page}>
        <div style={card}>
          <h1 style={h1}>Create your account</h1>
          <p></p>
          <form onSubmit={onRegister} style={{ display: "grid", gap: 12 }}>
            <input
              style={input}
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              style={input}
              placeholder="Password (at least 8 chars)"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button style={btnPrimary} type="submit">
              Create account
            </button>
          </form>
          {error && <p style={{ color: "crimson", marginTop: 10 }}>{error}</p>}
          <div
            style={{
              marginTop: 16,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <a style={link} onClick={() => setAuthView("choice")}>
              ← Back
            </a>
            <span>
              Already have an account?{" "}
              <a style={link} onClick={() => setAuthView("login")}>
                Sign in
              </a>
            </span>
          </div>
        </div>
      </div>
    );
  }

  // auth app
  return (
    <div style={page}>
      <div style={bigCard}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ margin: 0 }}>Signals Dashboard</h2>
          <p>Current Account: {email}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={createSignal}
              style={{
                padding: "8px 12px",
                borderRadius: 9999,
                background: "var(--primary)",
                color: "#fff",
                border: "1px solid var(--primary)",
                cursor: "pointer",
              }}
            >
              Create Signal
            </button>
            <button
              onClick={logout}
              style={{
                padding: "8px 12px",
                borderRadius: 9999,
                background: "#6b7280",
                color: "#fff",
                border: "1px solid #6b7280",
                cursor: "pointer",
              }}
            >
              Logout
            </button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            marginTop: 12,
          }}
        >
          <input
            style={{
              width: 220,
              padding: "8px 10px",
              border: "1px solid var(--border)",
              borderRadius: 10,
            }}
            placeholder="Filter by Name"
            value={type}
            onChange={(e) => setType(e.target.value)}
          />
          <label>
            From:{" "}
            <input
              style={{
                padding: "8px 10px",
                border: "1px solid var(--border)",
                borderRadius: 10,
              }}
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            To:{" "}
            <input
              style={{
                padding: "8px 10px",
                border: "1px solid var(--border)",
                borderRadius: 10,
              }}
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button
            onClick={fetchSignals}
            style={{
              padding: "8px 12px",
              borderRadius: 9999,
              background: "var(--primary)",
              color: "#fff",
              border: "1px solid var(--primary)",
              cursor: "pointer",
            }}
          >
            Apply filters
          </button>
          <span style={{ marginLeft: "auto" }}>{count} signals</span>
        </div>

        {error && <p style={{ color: "crimson", marginTop: 12 }}>{error}</p>}

        <ul style={{ listStyle: "none", padding: 0, marginTop: 16 }}>
          {signals.map((s) => (
            <li
              key={s._id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "12px 14px",
                marginBottom: 10,
                background: "#fafafa",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div>
                  <strong>{s.signal_type}</strong> •{" "}
                  <small>
                    {dayjs(s.timestamp).format("YYYY-MM-DD HH:mm:ss")}
                  </small>
                  <div>
                    <small>user: {s.user_id}</small>
                  </div>
                </div>
                <button
                  onClick={() => removeSignal(s._id)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 9999,
                    background: "#ef4444",
                    color: "#fff",
                    border: "1px solid #ef4444",
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
              <pre
                style={{
                  margin: "8px 0 0",
                  fontSize: 13,
                  background: "#fff",
                  padding: 8,
                  borderRadius: 8,
                  overflowX: "auto",
                }}
              >
                {JSON.stringify(s.payload, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
