// Pools mirror the ones in server.js. The server is the source of truth for
// the name/avatar you're given when you join; the client only uses these
// pools for standalone UI like the Landing preview badge.

export const ADJECTIVES = [
  "Neon", "Aqua", "Coral", "Abyss", "Deep", "Lunar", "Tidal", "Shimmer",
  "Midnight", "Velvet", "Glow", "Arctic", "Pearl", "Reef", "Drift", "Ghost",
  "Echo", "Prism", "Nebula", "Mist",
];

export const NOUNS = [
  "Jelly", "Squid", "Shark", "Orca", "Nautilus", "Eel", "Ray", "Fish",
  "Whale", "Urchin", "Crab", "Seal", "Otter", "Kraken", "Manta",
];

export const AVATARS = [
  "🦑", "🐙", "🐠", "🪼", "🐡", "🦈", "🐋", "🐟", "🪸", "🐚", "🐬", "🦀", "🦞",
];

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function randomName() {
  return pick(ADJECTIVES) + pick(NOUNS);
}

export function randomAvatar() {
  return pick(AVATARS);
}
