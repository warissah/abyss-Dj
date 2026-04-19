// Lightweight localStorage-backed identity. The server assigns the
// authoritative { userId, name, avatar } each time you join a room, so
// all this does is remember your last assignment across a refresh and
// provide a placeholder for the landing screen before you've joined.

import { randomAvatar, randomName } from "./names.js";

const KEY = "abyss.identity.v1";

export function loadIdentity() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveIdentity(identity) {
  try {
    localStorage.setItem(KEY, JSON.stringify(identity));
  } catch {
    // ignore: private mode / quota
  }
}

export function clearIdentity() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

// Used by Landing to show a preview avatar before the user has joined.
export function previewIdentity() {
  const existing = loadIdentity();
  if (existing) return existing;
  return {
    userId: null,
    name: randomName(),
    avatar: randomAvatar(),
  };
}
