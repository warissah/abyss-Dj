const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();
const mongoose = require('mongoose');



// ---------------- MONGO ----------------
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('MongoDB error:', err));

// ---------------- APP SETUP ----------------
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});


// NOW define emitState (important!)
function emitState() {
  io.emit("update", {
    queue,
    currentTrack,
    vibe: currentVibe
  });
}


app.use(cors());
app.use(express.json());

// ---------------- STATE ----------------
let queue = [];
let currentTrack = null;
let currentVibe = "party";
let trackStartTime = 0;
let trackDuration = 180;

// ---------------- GROQ AI ----------------
async function askAI(prompt) {
  const response = await fetch(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }]
      })
    }
  );

  const data = await response.json();
  return data.choices[0].message.content;
}

// ---------------- SPOTIFY ----------------
async function getSpotifyToken() {
  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const data = await response.json();
  return data.access_token;
}

async function searchSpotify(songName) {
  const token = await getSpotifyToken();

  const response = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(songName)}&type=track&limit=1`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  const data = await response.json();

  const track = data.tracks.items[0];

  return {
    name: track.name,
    artist: track.artists[0].name,
    uri: track.uri,
    id: track.id
  };
}

// ---------------- ROUTES ----------------

// Health
app.get('/', (req, res) => {
  res.json({ message: 'Abyss Vibe DJ backend is alive' });
});

// AI test
app.get('/test-ai', async (req, res) => {
  const response = await askAI('Say one hype DJ sentence.');
  res.json({ response });
});

// Spotify test
app.get('/test-spotify', async (req, res) => {
  const track = await searchSpotify('Uptown Funk Bruno Mars');
  res.json(track);
});

// ---------------- QUEUE SYSTEM ----------------

// Add song (AI auto vibe tagging)
app.post('/queue/add', async (req, res) => {
  const { song, artist, uri } = req.body;

  if (!song) {
    return res.status(400).json({ error: "Song required" });
  }

  try {
    const vibeResponse = await askAI(`
Classify this song into ONE word vibe:

Song: ${song}
Artist: ${artist}

Choose ONE:
hype, chill, party, pop, trap, edm, rock, rnb, sad

Return ONLY one word.
`);

    const vibe = vibeResponse.split('\n')[0].trim().toLowerCase();

    const item = {
      song,
      artist,
      uri,
      vibe,
      addedAt: Date.now()
    };

    queue.push(item);
    emitState();

    res.json({ message: "Added to queue", item, queue });

  } catch (err) {
    res.status(500).json({ error: "Vibe classification failed" });
  }
});

// Get queue
app.get('/queue', (req, res) => {
  res.json({ queue });
});

// ---------------- DJ LOGIC ----------------

function getDominantVibe() {
  if (queue.length === 0) return "party";

  const counts = {};

  for (const item of queue) {
    counts[item.vibe] = (counts[item.vibe] || 0) + 1;
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])[0][0];
}

function playNextSong() {
  if (queue.length === 0) return null;

  const next = queue.shift();

  currentTrack = next;
  trackStartTime = Date.now();
  trackDuration = 180;

  return next;
}

// ---------------- AUTO DJ LOOP ----------------

setInterval(async () => {
  try {
    const now = Date.now();

    const songEnded =
      !currentTrack ||
      (now - trackStartTime) / 1000 >= trackDuration - 5;

    if (!songEnded) return;

    const dominantVibe = getDominantVibe();
    currentVibe = dominantVibe;

    console.log("🎧 Dominant vibe:", dominantVibe);

    const aiResponse = await askAI(`
You are an AI DJ.

Current vibe: ${dominantVibe}

Suggest ONE song.
Return ONLY:
Song Name - Artist Name

emitState();

`);

    const cleaned = aiResponse.split('\n')[0].trim();

    const track = await searchSpotify(cleaned);

    currentTrack = track;
    trackStartTime = Date.now();

    emitState();

    console.log("▶️ Now playing:", track.name, "-", track.artist);

  } catch (err) {
    console.error("DJ loop error:", err.message);
  }
}, 5000);

// ---------------- SOCKET.IO ----------------
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);



  socket.on('join_room', (roomCode) => {
    socket.join(roomCode);

    const userId = `user_${Math.floor(Math.random() * 9999)}`;

    socket.emit('joined', { roomCode, userId });

    console.log(`${userId} joined room ${roomCode}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// ---------------- START SERVER ----------------
const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
