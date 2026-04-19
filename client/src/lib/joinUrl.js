import { BACKEND_URL } from "../socket.js";

const CLIENT_PORT =
  import.meta.env.VITE_CLIENT_PORT != null && import.meta.env.VITE_CLIENT_PORT !== ""
    ? String(import.meta.env.VITE_CLIENT_PORT)
    : "5173";

export function isLoopbackHostname(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

export function defaultJoinUrl(code) {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}?room=${encodeURIComponent(code)}`;
}

/**
 * URL for QR / clipboard. On localhost, asks the backend for this machine's
 * LAN IPv4 so other devices on Wi‑Fi can load the Vite app.
 */
export async function resolveShareJoinUrl(code) {
  const def = defaultJoinUrl(code);
  if (typeof window === "undefined") return def;
  const { hostname, pathname, port } = window.location;
  if (!isLoopbackHostname(hostname)) return def;

  const devPort = port && port !== "" ? port : CLIENT_PORT;

  try {
    const r = await fetch(`${BACKEND_URL}/dev/lan`);
    if (!r.ok) return def;
    const data = await r.json();
    const ipv4 = data && typeof data.ipv4 === "string" ? data.ipv4 : null;
    if (!ipv4) return def;
    return `http://${ipv4}:${devPort}${pathname}?room=${encodeURIComponent(code)}`;
  } catch {
    return def;
  }
}
