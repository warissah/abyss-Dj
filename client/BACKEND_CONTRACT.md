# Backend Contract — Abyss Vibe DJ

Reference for anyone extending the in-memory Socket.IO server. The client
(`abyss-Dj/client/`) already emits and listens for all the events below;
the server only needs to implement the new ones to light up Tier 2/3
features.

There is no database. Everything lives in memory inside `server.js`'s
`rooms` Map — a restart wipes state, which is fine for the demo.

Existing Tier-1 events (already working against `server.js`) are **not**
repeated here unless their payload changed.

## Summary of new events

| Direction | Event | Payload | Status |
|---|---|---|---|
| Client → Server | `dj_request` | `{ prompt, context }` | **New** (Tier 2 AI DJ) |
| Server → Client | `dj_response` | `{ reply, addedTracks? }` | **New** (Tier 2 AI DJ) |
| Client → Server | `like_track` | `{ trackId }` | **New** (Tier 3 likes) |
| Client → Server | `unlike_track` | `{ trackId }` | **New** (Tier 3 likes) |
| Client → Server | `vote_skip` | `{}` | **New** (Tier 3 skip) |
| Client → Server | `unvote_skip` | `{}` | **New** (Tier 3 skip) |
| Server → Client | `ai_message` | `{ text, vibe? }` | **New**, optional |
| Server → Client | `queue_updated` | `{ queue }` with `likes`/`likedBy` per track | **Expanded** |
| Server → Client | `now_playing` | adds `skipVotes: string[]` | **Expanded** |
| Server → Client | `room_update` | may include `energy: number (0-100)` | **Expanded** |

---

## AI DJ chat interpretation (Tier 2)

### Client → `dj_request`

```ts
{
  prompt: string;             // raw natural-language request
  context: {
    currentTrack: { id, name, artist } | null;
    vibe: string;             // current room vibe, e.g. "chill"
    energy: number;           // 0-100 (server's own value if set, else client estimate)
  };
}
```

The client decides `dj_request` vs `add_song` locally via
[`src/lib/intent.js`](src/lib/intent.js). The server can treat anything
that arrives as `dj_request` as "interpret mood/energy/genre and add 1–3
songs to the queue".

Suggested server behavior:
1. Call Gemini (reuse the existing `askAI()` helper) with the prompt +
   context. Ask it to return a short 1-sentence DJ reply and 1–3 track
   search strings.
2. For each search string, call `searchTrack()` (backed by the iTunes
   Search API) and push the result to `room.queue`.
3. Emit `dj_response` to the **requesting socket only**, then emit
   `queue_updated` to the whole room.

### Server → `dj_response`

```ts
{
  reply: string;              // "Cooling things down with some mellow R&B"
  addedTracks?: Track[];      // optional — client doesn't use it directly,
                              // queue_updated already covers the queue.
}
```

The client shows `reply` in a bubble above the chat bar for 6 seconds. If
no `dj_response` arrives within **8 seconds**, the client aborts and shows
"DJ didn't respond, try again".

---

## Likes (Tier 3)

### Client → `like_track` / `unlike_track`

```ts
{ trackId: string }           // matches track.id in the queue
```

### Server responsibilities

- Maintain `likes: number` and `likedBy: string[]` per track (userId array).
  Store this directly on the track objects inside `room.queue` and
  `room.currentTrack`.
- On change, **re-emit `queue_updated` and/or `now_playing`** with the
  expanded payload so every client updates in real time.
- Double-likes are idempotent: a user already in `likedBy` is a no-op.

### Expanded `queue_updated`

```ts
{
  queue: Track[];             // each Track now carries likes + likedBy
}
```

### Expanded `Track` shape

```ts
{
  id, name, artist, uri, preview_url, albumArt,
  addedBy: string,
  vibe?: string,
  likes: number,              // NEW — default 0
  likedBy: string[];          // NEW — array of userIds, default []
}
```

The client uses `likedBy` to decide if the heart is filled for the local
viewer (`likedBy.includes(myUserId)`), and `likes` for the counter.

---

## Skip voting (Tier 3)

### Client → `vote_skip` / `unvote_skip`

```ts
{}                            // room + user inferred from socket.data
```

### Server responsibilities

- Maintain `skipVotes: string[]` (array of userIds) **per room**, scoped
  to the currently-playing track. Reset to `[]` whenever `currentTrack`
  changes (the existing `advanceTrack()` function is the natural place).
- When `skipVotes.length >= Math.ceil(memberCount / 2)`, call
  `advanceTrack(room)` immediately.
- Emit updated `skipVotes` on **every now_playing payload** and
  optionally on `room_update`.

### Expanded `now_playing`

```ts
{
  currentTrack: Track | null,
  trackStartedAt: number,
  trackDurationMs: number,
  skipVotes: string[];        // NEW
}
```

---

## AI personality messages (Tier 3)

Optional. The client already cycles its own DJ chatter from
[`src/lib/djMessages.js`](src/lib/djMessages.js).

### Server → `ai_message`

```ts
{
  text: string;               // "Reading the room... switching to trap"
  vibe?: string;              // optional, purely informational
}
```

If the server emits this, the client pins the text in the chatter slot for
6 seconds before resuming its own local rotation.

---

## Vibe evolution (Tier 3)

Optional server-driven energy value.

### Expanded `room_update`

```ts
{
  vibe?: string;
  hostUserId?: string;
  energy?: number;            // NEW, 0-100. Drives VibeOrb pulse + scale.
}
```

If omitted, the client falls back to a local estimate derived from recent
`user_joined`, `queue_updated`, likes, and skips in the last 60 seconds.

Suggested server logic for `energy`: after each notable event, bump a
per-room counter by +8/+12 and decay by 1 every 2s, capped at `[0, 100]`.
Anything roughly correlated with "room activity" works.

---

## In-memory `RoomState` shape (reference)

The current `rooms: Map<code, RoomState>` in `server.js` already holds
most of this. The new fields (bold) are what you need to add when
implementing the events above.

```
RoomState {
  code:            string
  hostUserId:      string | null
  members:         Map<userId, Member>
  queue:           Track[]
  currentTrack:    Track | null
  trackStartedAt:  number   // Date.now() ms
  trackDurationMs: number   // 30_000 for iTunes previews
  vibe:            string   // "chill" | "hype" | "party" | ...
  emptySince:      number | null
  energy:          number   // NEW, 0-100, optional
  skipVotes:       string[] // NEW, userIds for the current track only
}

Track {
  id:          string    // iTunes trackId stringified
  name:        string
  artist:      string
  uri:         string
  preview_url: string | null
  albumArt:    string | null
  addedBy:     string    // userId
  vibe:        string    // one-word tag from Gemini (added async)
  likes:       number    // NEW, default 0
  likedBy:     string[]  // NEW, userIds, default []
}

Member {
  userId:   string
  name:     string
  avatar:   string
  socketId: string
  joinedAt: number
}
```

---

## Client files that produce/consume these events

- Emits: [`src/components/ChatBar.jsx`](src/components/ChatBar.jsx),
  [`src/components/LikeButton.jsx`](src/components/LikeButton.jsx),
  [`src/components/SkipVote.jsx`](src/components/SkipVote.jsx).
- Listens / folds into state: [`src/components/Room.jsx`](src/components/Room.jsx),
  [`src/components/AiDjChatter.jsx`](src/components/AiDjChatter.jsx).
- Intent routing: [`src/lib/intent.js`](src/lib/intent.js) — tweak the
  keyword list if the heuristic mis-classifies real song titles.

## Graceful degradation

All client emits are fire-and-forget. If the server hasn't implemented a
given event yet:
- `dj_request` falls back to a timeout + error toast after 8s.
- `like_track` still toggles the heart locally (counter shows 1).
- `vote_skip` toggles the button but nothing happens (no skip, no sync).

Nothing breaks. When the server side ships, every feature just lights up.
