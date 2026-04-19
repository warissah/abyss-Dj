const USER_END_PATH = "/user-end";
const NAVIGATION_EVENT = "app:navigate";

function normalizePath(pathname) {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function normalizeRoomCode(value) {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
  return raw || null;
}

function pushUrl(pathname, search = "") {
  const target = `${pathname}${search}`;
  if (`${window.location.pathname}${window.location.search}` === target) return;
  window.history.pushState({}, "", target);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}

export function readRouteFromUrl(location = window.location) {
  const params = new URLSearchParams(location.search);
  const roomCode = normalizeRoomCode(params.get("room"));
  if (roomCode) return { name: "room", roomCode };

  const path = normalizePath(location.pathname);
  if (path === USER_END_PATH) return { name: "user-end" };
  return { name: "landing" };
}

export function goToRoom(roomCode) {
  const normalized = normalizeRoomCode(roomCode);
  if (!normalized) return;
  pushUrl("/", `?room=${encodeURIComponent(normalized)}`);
}

export function goToLanding() {
  pushUrl("/", "");
}

export function goToUserEnd() {
  pushUrl(USER_END_PATH, "");
}

export function getNavigationEventName() {
  return NAVIGATION_EVENT;
}
