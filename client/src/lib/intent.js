// Heuristic classifier for the chat bar.
//
// Given whatever the user typed, return either "dj_request" (natural-language
// mood/energy prompt for the AI DJ) or "add_song" (literal Spotify search).
// Tuned to fail safe toward add_song so that typing "Uptown Funk" doesn't
// accidentally trip the AI path.

const INTENT_KEYWORDS = [
  // verbs that signal "do something" rather than "find this exact track"
  "play", "queue", "drop", "put", "add", "give", "make", "throw",
  "switch", "change", "keep", "keeping", "turn",
  // mood / energy words
  "chill", "chillax", "relax", "calm", "smooth", "mellow",
  "hype", "hyped", "energy", "energetic", "pump", "pumped", "lit",
  "party", "dance", "club", "bangers",
  "sad", "emo", "moody", "dark",
  "happy", "upbeat", "vibey", "vibes", "vibe",
  "slow", "slower", "fast", "faster", "soft", "softer", "hard", "harder",
  "more", "less", "little", "bit",
  // shape words
  "mood", "something", "anything", "stuff", "tunes", "song", "songs", "track", "tracks",
  // requesty phrasing
  "please", "plz", "can", "could", "would",
];

const KEYWORD_SET = new Set(INTENT_KEYWORDS);

// If the string contains any of these on its own, treat as dj_request no matter what.
const STRONG_PHRASES = [
  "play something", "something chill", "something more", "something less",
  "turn it up", "turn it down", "switch it up", "switch the vibe",
  "more energy", "less energy", "keep it",
];

export function classifyChat(raw) {
  const text = String(raw || "").trim();
  if (!text) return { kind: "noop", text: "" };

  const lower = text.toLowerCase();

  for (const phrase of STRONG_PHRASES) {
    if (lower.includes(phrase)) {
      return { kind: "dj_request", text };
    }
  }

  // Questions are almost always DJ requests, not track titles.
  if (lower.endsWith("?")) {
    return { kind: "dj_request", text };
  }

  // Split on whitespace + punctuation, count intent-keyword hits.
  const tokens = lower
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return { kind: "add_song", text };

  let hits = 0;
  for (const t of tokens) {
    if (KEYWORD_SET.has(t)) hits++;
  }

  // A single keyword in a short sentence (e.g. "chill songs") is enough.
  // For longer strings, require at least 2 so real song titles like
  // "Play That Funky Music" aren't always intercepted (the word "play"
  // is there, but so are a bunch of non-keywords).
  const threshold = tokens.length <= 3 ? 1 : 2;

  return hits >= threshold
    ? { kind: "dj_request", text }
    : { kind: "add_song", text };
}
