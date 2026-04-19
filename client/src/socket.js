import { io } from "socket.io-client";

// Override in client/.env with VITE_BACKEND_URL for deployed builds.
export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

// autoConnect is off so <Landing /> can render without opening a socket;
// we only connect when the user actually enters a room.
export const socket = io(BACKEND_URL, {
  autoConnect: false,
});
