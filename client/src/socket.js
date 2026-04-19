import { io } from "socket.io-client";

// Pick the backend URL in this order:
//   1. VITE_BACKEND_URL env override (for deployed builds)
//   2. Same hostname as the current page on port 3000. This means the same
//      bundle works from `localhost:5173` on the laptop AND from
//      `http://<laptop-lan-ip>:5173` on a phone -- each client dials back
//      to whichever host it loaded the page from, on port 3000.
function defaultBackendUrl() {
  if (typeof window === "undefined") return "http://localhost:3000";
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3000`;
}

export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || defaultBackendUrl();

// autoConnect is off so <Landing /> can render without opening a socket;
// we only connect when the user actually enters a room.
export const socket = io(BACKEND_URL, {
  autoConnect: false,
});
