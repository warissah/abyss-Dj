const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

// ---------------- APP SETUP ----------------
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// ---------------- IDENTITY POOLS ----------------
// Temp-user name + avatar generators. Duplicated on the client (lib/names.js)
// for any UI labels that need to render without waiting on the server.
const ADJECTIVES = [
  'Neon', 'Aqua', 'Coral', 'Abyss', 'Deep', 'Lunar', 'Tidal', 'Shimmer',
  'Midnight', 'Velvet', 'Glow', 'Arctic', 'Pearl', 'Reef', 'Drift', 'Ghost',
  'Echo', 'Prism', 'Nebula', 'Mist',
];
const NOUNS = [
  'Jelly', 'Squid', 'Shark', 'Orca', 'Nautilus', 'Eel', 'Ray', 'Fish',
  'Whale', 'Urchin', 'Crab', 'Seal', 'Otter', 'Kraken', 'Manta',
];
const AVATARS = ['🦑', '🐙', '🐠', '🪼', '🐡', '🦈', '🐋', '🐟', '🪸', '🐚', '🐬', '🦀', '🦞'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function generateIdentity() {
  return {
    userId: `u_${Math.random().toString(36).slice(2, 10)}`,
    name: pick(ADJECTIVES) + pick(NOUNS),
    avatar: pick(AVATARS),
  };
}

function generateRoomCode() {
  // Skip ambiguous chars (0/O, 1/I) so codes are easy to type.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

// ---------------- ROOM STATE (in-memory) ----------------
// rooms: Map<roomCode, RoomState>
// All state lives in process memory; a server restart wipes everything. This
// is intentional -- the app is single-process and session-scoped.
const rooms = new Map();

// iTunes previews are 30 seconds. Source of truth for playback timing.
const TRACK_DURATION_MS = 30_000;

function createRoom() {
  let code;
  do { code = generateRoomCode(); } while (rooms.has(code));
  const room = {
    code,
    hostUserId: null,
    members: new Map(), // userId -> { userId, name, avatar, socketId, joinedAt }
    queue: [],
    currentTrack: null,
    trackStartedAt: 0,
    trackDurationMs: TRACK_DURATION_MS,
    vibe: 'party',
    emptySince: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

function roomSnapshot(room) {
  return {
    code: room.code,
    hostUserId: room.hostUserId,
    members: Array.from(room.members.values()).map((m) => ({
      userId: m.userId,
      name: m.name,
      avatar: m.avatar,
      joinedAt: m.joinedAt,
    })),
    queue: room.queue,
    currentTrack: room.currentTrack,
    trackStartedAt: room.trackStartedAt,
    trackDurationMs: room.trackDurationMs,
    vibe: room.vibe,
  };
}

function emitNowPlaying(room) {
  io.to(room.code).emit('now_playing', {
    currentTrack: room.currentTrack,
    trackStartedAt: room.trackStartedAt,
    trackDurationMs: room.trackDurationMs,
  });
}

function emitQueueUpdated(room) {
  io.to(room.code).emit('queue_updated', { queue: room.queue });
}

// ---------------- HTTP HELPERS ----------------
// Parses an HTTP response as JSON but includes the raw body in thrown errors
// so we can see captive-portal / proxy HTML pages instead of getting a
// useless `SyntaxError: Unexpected token 'A', "Active pre"...` in logs.
async function parseJsonOrThrow(response, label) {
  const raw = await response.text();
  try {
    return JSON.parse(raw);
  } catch {
    const preview = raw.slice(0, 200).replace(/\s+/g, ' ');
    throw new Error(
      `${label} returned non-JSON (status ${response.status}). ` +
        `Body starts with: "${preview}". ` +
        `If this looks like an HTML/captive-portal page, your network is ` +
        `intercepting the request.`
    );
  }
}

// ---------------- GEMINI AI ----------------
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

// `options.json = true` switches Gemini into JSON-only response mode, which
// is essential for the dj_request handler because it parses the reply as
// strict JSON. `maxOutputTokens` defaults to 256 so structured responses
// (reply + 1-3 queries) don't get truncated mid-string.
async function askAI(prompt, options = {}) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set in .env');
  }

  const generationConfig = {
    temperature: options.temperature ?? 0.8,
    maxOutputTokens: options.maxOutputTokens ?? 256,
  };
  if (options.json) {
    generationConfig.responseMimeType = 'application/json';
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
      }),
    }
  );

  const data = await parseJsonOrThrow(response, 'Gemini');
  if (!response.ok) {
    throw new Error(`Gemini error ${response.status}: ${JSON.stringify(data)}`);
  }
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ---------------- TRACK SEARCH (iTunes) ----------------
// We use Apple's iTunes Search API because it:
//   - Requires zero auth (no client id/secret, no Premium account)
//   - Returns a 30-second previewUrl for ~every track in the catalog
//   - Is rate-limited loosely enough for hackathon-scale traffic
//
// Returned shape: { id, name, artist, uri, preview_url, albumArt } so the
// rest of the app (AudioPlayer, Room.jsx) doesn't have to change.
async function searchTrack(query) {
  const url =
    `https://itunes.apple.com/search?media=music&entity=song&limit=5&term=` +
    encodeURIComponent(query);

  const response = await fetch(url);
  const data = await parseJsonOrThrow(response, 'iTunes search');
  if (!response.ok) {
    throw new Error(
      `iTunes search error ${response.status}: ${JSON.stringify(data).slice(0, 200)}`
    );
  }

  const items = Array.isArray(data.results) ? data.results : [];
  if (items.length === 0) return null;

  // Prefer the first result with a real preview; fall back to the top hit.
  const picked = items.find((t) => t.previewUrl) || items[0];

  // Upgrade artwork from 100x100 to 600x600 (iTunes serves the same URL at
  // whatever size you ask for, just by string-replacing the filename).
  const art = picked.artworkUrl100
    ? picked.artworkUrl100.replace('100x100', '600x600')
    : null;

  return {
    id: String(picked.trackId ?? `${picked.collectionId}-${picked.trackNumber}`),
    name: picked.trackName ?? 'Unknown',
    artist: picked.artistName ?? 'Unknown',
    uri: picked.trackViewUrl ?? '',
    preview_url: picked.previewUrl || null,
    albumArt: art,
  };
}

// ---------------- REST ROUTES ----------------
app.get('/', (req, res) => {
  res.json({ message: 'Abyss Vibe DJ backend is alive', rooms: rooms.size });
});

// Host flow: create a new room, return its code. First socket to join_room
// on this code becomes the host.
app.post('/rooms', (req, res) => {
  const room = createRoom();
  console.log(`Room created: ${room.code}`);
  res.json({ roomCode: room.code });
});

// Guest flow: validate a shared link before showing the room UI.
app.get('/rooms/:code', (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const room = rooms.get(code);
  if (!room) return res.json({ exists: false });
  res.json({ exists: true, memberCount: room.members.size });
});

app.get('/test-ai', async (req, res) => {
  try {
    const response = await askAI('Say one hype DJ sentence.');
    res.json({ response });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/test-search', async (req, res) => {
  try {
    const track = await searchTrack('Uptown Funk Bruno Mars');
    res.json(track);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- DJ LOGIC ----------------
function getDominantVibe(queue) {
  if (queue.length === 0) return 'party';
  const counts = {};
  for (const item of queue) {
    if (!item.vibe) continue;
    counts[item.vibe] = (counts[item.vibe] || 0) + 1;
  }
  const entries = Object.entries(counts);
  if (entries.length === 0) return 'party';
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function advanceTrack(room) {
  const next = room.queue.shift() || null;
  room.currentTrack = next;
  room.trackStartedAt = next ? Date.now() : 0;
  room.vibe = getDominantVibe(room.queue);

  emitQueueUpdated(room);
  emitNowPlaying(room);
  io.to(room.code).emit('room_update', { vibe: room.vibe });

  if (next) {
    console.log(`[${room.code}] Now playing: ${next.name} - ${next.artist}`);
  } else {
    console.log(`[${room.code}] Queue drained, playback stopped.`);
  }
}

// Tag a freshly-added track's vibe with Gemini in the background so adding
// a song stays snappy. When it resolves we re-emit the queue and vibe.
function tagVibeAsync(room, track) {
  askAI(`
Classify this song into ONE word vibe.
Song: ${track.name}
Artist: ${track.artist}
Choose ONE: hype, chill, party, pop, trap, edm, rock, rnb, sad.
Return ONLY one word.
`)
    .then((text) => {
      const vibe = (text || '').split('\n')[0].trim().toLowerCase();
      track.vibe = vibe;
      room.vibe = getDominantVibe(room.queue);
      emitQueueUpdated(room);
      io.to(room.code).emit('room_update', { vibe: room.vibe });
    })
    .catch((err) => console.warn(`[${room.code}] vibe tag failed:`, err.message));
}

// ---------------- AUTO DJ LOOP ----------------
// One global 1-second tick that walks every active room. Fine at hackathon
// scale (tens of rooms); not production-grade.
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.members.size === 0) continue;

    const hasTrack = !!room.currentTrack;
    const elapsed = hasTrack && now - room.trackStartedAt >= room.trackDurationMs - 200;

    if (!hasTrack && room.queue.length > 0) {
      advanceTrack(room);
    } else if (elapsed) {
      advanceTrack(room);
    }
  }
}, 1000);

// GC: drop empty rooms after 5 minutes so long-running dev servers don't leak.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (room.members.size === 0 && room.emptySince && now - room.emptySince > 5 * 60 * 1000) {
      rooms.delete(code);
      console.log(`Room ${code} garbage-collected.`);
    }
  }
}, 60 * 1000);

// ---------------- SOCKET.IO ----------------
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('join_room', ({ roomCode } = {}) => {
    try {
      const code = String(roomCode || '').toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        socket.emit('join_error', { error: 'Room not found' });
        return;
      }

      const identity = generateIdentity();
      const member = {
        ...identity,
        socketId: socket.id,
        joinedAt: Date.now(),
      };
      room.members.set(identity.userId, member);
      room.emptySince = null;

      if (!room.hostUserId) room.hostUserId = identity.userId;

      socket.join(code);
      socket.data.userId = identity.userId;
      socket.data.roomCode = code;

      socket.emit('joined', {
        userId: identity.userId,
        name: identity.name,
        avatar: identity.avatar,
        isHost: room.hostUserId === identity.userId,
      });

      socket.emit('room_state', roomSnapshot(room));

      socket.to(code).emit('user_joined', {
        userId: identity.userId,
        name: identity.name,
        avatar: identity.avatar,
      });

      console.log(`[${code}] ${identity.name} joined (${room.members.size} members)`);
    } catch (err) {
      console.error('join_room error:', err);
      socket.emit('join_error', { error: err.message });
    }
  });

  socket.on('add_song', async ({ query } = {}) => {
    const code = socket.data.roomCode;
    const userId = socket.data.userId;
    if (!code || !userId) {
      socket.emit('add_song_error', { error: 'Not in a room' });
      return;
    }
    const room = rooms.get(code);
    if (!room) {
      socket.emit('add_song_error', { error: 'Room gone' });
      return;
    }
    if (!query || !String(query).trim()) {
      socket.emit('add_song_error', { error: 'Empty query' });
      return;
    }

    try {
      const track = await searchTrack(String(query).trim());
      if (!track) {
        socket.emit('add_song_error', { error: 'No results' });
        return;
      }
      track.addedBy = userId;
      room.queue.push(track);

      // Promote immediately when nothing is playing so the first add starts
      // audio instantly instead of waiting for the 1s DJ tick.
      if (!room.currentTrack) {
        advanceTrack(room);
      } else {
        emitQueueUpdated(room);
      }

      tagVibeAsync(room, track);
    } catch (err) {
      console.error('add_song error:', err);
      socket.emit('add_song_error', { error: err.message });
    }
  });

  // Natural-language DJ request: ChatBar routes prompts like "play something
  // chill" here via intent.js. We ask Gemini to return strict JSON with a
  // short DJ reply + 1-3 track search strings, then run each through iTunes
  // and push the results into the queue. The reply goes to the requesting
  // socket only; queue_updated goes to the whole room.
  socket.on('dj_request', async ({ prompt, context } = {}) => {
    const code = socket.data.roomCode;
    const userId = socket.data.userId;
    if (!code || !userId) {
      socket.emit('dj_response', { reply: "You're not in a room." });
      return;
    }
    const room = rooms.get(code);
    if (!room) {
      socket.emit('dj_response', { reply: 'Room is gone.' });
      return;
    }
    if (!prompt || !String(prompt).trim()) {
      socket.emit('dj_response', { reply: 'Tell me the vibe you want.' });
      return;
    }

    try {
      const ctx = context || {};
      const currentLine = ctx.currentTrack
        ? `${ctx.currentTrack.name} by ${ctx.currentTrack.artist}`
        : 'nothing playing';

      const aiRaw = await askAI(
        `
You are the DJ for an online listening room.
Current track: ${currentLine}.
Current vibe: ${ctx.vibe || 'unknown'}.
User just said: "${String(prompt).trim()}"

Respond with STRICT JSON only:
{
  "reply": "<one short DJ sentence, under 15 words>",
  "queries": ["<search string 1>", "<search string 2>", "<search string 3>"]
}

The queries must be real, well-known songs that match what the user asked.
Format each query as "<song title> <artist>" so it's easy to find.
Return 1-3 queries.
`,
        { json: true, maxOutputTokens: 256, temperature: 0.9 }
      );

      let parsed;
      try {
        const cleaned = aiRaw
          .trim()
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```\s*$/i, '');
        parsed = JSON.parse(cleaned);
      } catch {
        socket.emit('dj_response', {
          reply: 'The DJ mumbled something unreadable. Try again?',
        });
        return;
      }

      const reply = (parsed.reply || 'Spinning something up').toString().slice(0, 140);
      const queries = Array.isArray(parsed.queries)
        ? parsed.queries
            .filter((q) => typeof q === 'string' && q.trim())
            .slice(0, 3)
        : [];

      socket.emit('dj_response', { reply });

      if (queries.length === 0) return;

      const added = [];
      for (const q of queries) {
        try {
          const track = await searchTrack(q);
          if (!track) continue;
          track.addedBy = userId;
          room.queue.push(track);
          added.push(track);
        } catch (err) {
          console.warn(`[${code}] dj_request search failed for "${q}":`, err.message);
        }
      }

      if (added.length === 0) return;

      if (!room.currentTrack) {
        advanceTrack(room);
      } else {
        emitQueueUpdated(room);
      }

      for (const t of added) tagVibeAsync(room, t);

      console.log(
        `[${code}] DJ added ${added.length} track(s) from prompt: "${prompt}"`
      );
    } catch (err) {
      console.error('dj_request error:', err);
      socket.emit('dj_response', {
        reply: `DJ booth short-circuited: ${err.message}`,
      });
    }
  });

  socket.on('disconnect', () => {
    const { userId, roomCode } = socket.data || {};
    if (!userId || !roomCode) {
      console.log('Socket disconnected (no room):', socket.id);
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) return;

    const member = room.members.get(userId);
    room.members.delete(userId);

    io.to(roomCode).emit('user_left', {
      userId,
      name: member?.name,
      avatar: member?.avatar,
    });

    // Naive host handoff: next member in insertion order becomes host.
    if (room.hostUserId === userId) {
      const next = room.members.values().next().value;
      room.hostUserId = next?.userId ?? null;
      io.to(roomCode).emit('room_update', { hostUserId: room.hostUserId });
    }

    if (room.members.size === 0) {
      room.emptySince = Date.now();
    }

    console.log(
      `[${roomCode}] ${member?.name ?? userId} left (${room.members.size} members)`
    );
  });
});

// ---------------- START SERVER ----------------
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
