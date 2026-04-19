import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { socket } from "../socket.js";
import { loadIdentity, saveIdentity } from "../lib/identity.js";
import {
  defaultJoinUrl,
  isLoopbackHostname,
  resolveShareJoinUrl,
} from "../lib/joinUrl.js";
import HostView from "./HostView.jsx";
import GuestView from "./GuestView.jsx";

const INITIAL_STATE = {
  code: "",
  hostUserId: null,
  members: [],
  queue: [],
  currentTrack: null,
  trackStartedAt: 0,
  trackDurationMs: 30_000,
  vibe: "loading",
  skipVotes: [],
  serverEnergy: null,
};

// Local energy estimator (host-only, since guests don't see the vibe orb).
const ENERGY_WINDOW_MS = 60_000;
const ENERGY_PER_EVENT = 12;
const ENERGY_REFRESH_MS = 2000;

// Host-only autopilot safety net. If the queue drains AND the server's AI
// extender can't refill it fast enough (cooldown, network hiccup, whatever),
// the host client drops in a canned vibe-matched request via the existing
// add_song socket event. Keeps the music alive during demos without touching
// the backend.
const AUTOPILOT_TICK_MS = 2000;
const AUTOPILOT_EMPTY_THRESHOLD_MS = 8000;
const AUTOPILOT_COOLDOWN_MS = 12_000;
const FALLBACK_TRACKS = {
  chill: [
    "Weightless Marconi Union",
    "Porcelain Moby",
    "Sunset Lover Petit Biscuit",
    "Night Owl Galimatias",
    "Intro The xx",
  ],
  hype: [
    "Stronger Kanye West",
    "Till I Collapse Eminem",
    "Lose Yourself Eminem",
    "Power Kanye West",
    "Remember The Name Fort Minor",
  ],
  party: [
    "Uptown Funk Bruno Mars",
    "Dance Monkey Tones and I",
    "Don't Stop the Music Rihanna",
    "Blinding Lights The Weeknd",
    "I Wanna Dance with Somebody Whitney Houston",
  ],
  pop: [
    "Shake It Off Taylor Swift",
    "As It Was Harry Styles",
    "Levitating Dua Lipa",
    "Watermelon Sugar Harry Styles",
    "Good 4 U Olivia Rodrigo",
  ],
  trap: [
    "Mask Off Future",
    "Sicko Mode Travis Scott",
    "Humble Kendrick Lamar",
    "Goosebumps Travis Scott",
    "Redbone Childish Gambino",
  ],
  edm: [
    "Animals Martin Garrix",
    "Titanium David Guetta",
    "Levels Avicii",
    "Wake Me Up Avicii",
    "Clarity Zedd",
  ],
  rock: [
    "Mr Brightside The Killers",
    "Sweet Child O Mine Guns N Roses",
    "Don't Stop Believin Journey",
    "Smells Like Teen Spirit Nirvana",
    "Bohemian Rhapsody Queen",
  ],
  rnb: [
    "Die For You The Weeknd",
    "Location Khalid",
    "Redbone Childish Gambino",
    "Come Through and Chill Miguel",
    "Best Part Daniel Caesar",
  ],
  sad: [
    "Someone Like You Adele",
    "Mad World Gary Jules",
    "The Night We Met Lord Huron",
    "Fix You Coldplay",
    "Skinny Love Bon Iver",
  ],
  default: [
    "Blinding Lights The Weeknd",
    "Uptown Funk Bruno Mars",
    "As It Was Harry Styles",
    "Levitating Dua Lipa",
    "Good 4 U Olivia Rodrigo",
  ],
};

// Orchestrator. Owns the socket connection + shared room state, then hands
// off rendering to either HostView (full dashboard) or GuestView (minimal
// add-a-song UI) based on the identity assigned by the server.
export default function Room({ code }) {
  const [me, setMe] = useState(null);
  const [state, setState] = useState({ ...INITIAL_STATE, code });
  const [toasts, setToasts] = useState([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [lanJoinUrl, setLanJoinUrl] = useState(null);
  const [localEnergy, setLocalEnergy] = useState(30);

  const shareJoinUrl = useMemo(() => {
    if (typeof window === "undefined") return null;
    if (!isLoopbackHostname(window.location.hostname)) {
      return defaultJoinUrl(code);
    }
    return lanJoinUrl;
  }, [code, lanJoinUrl]);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!isLoopbackHostname(window.location.hostname)) return undefined;
    let cancelled = false;
    resolveShareJoinUrl(code).then((u) => {
      if (!cancelled) setLanJoinUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const pulsesRef = useRef([]);
  const bumpEnergy = useCallback(() => {
    pulsesRef.current.push(Date.now());
  }, []);

  const toastIdRef = useRef(0);
  const pushToast = useCallback((toast) => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((prev) => [...prev, { id, ...toast }]);
  }, []);
  const expireToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const tick = () => {
      const cutoff = Date.now() - ENERGY_WINDOW_MS;
      pulsesRef.current = pulsesRef.current.filter((ts) => ts >= cutoff);
      const raw = pulsesRef.current.length * ENERGY_PER_EVENT;
      setLocalEnergy(Math.max(15, Math.min(100, raw || 20)));
    };
    tick();
    const id = setInterval(tick, ENERGY_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // Host-only queue autopilot. Watches the queue, and if it sits empty for
  // longer than AUTOPILOT_EMPTY_THRESHOLD_MS, drops in a canned vibe-matched
  // song via add_song. Cooldown prevents runaway stacking when the server
  // briefly catches up. Only the current host runs this so guests never
  // double-fire.
  useEffect(() => {
    if (!me?.userId || !state.hostUserId || state.hostUserId !== me.userId) {
      return undefined;
    }

    let emptySince = 0;
    let lastFillAt = 0;

    const tick = () => {
      const s = stateRef.current;
      const now = Date.now();
      const queueEmpty = !s.queue || s.queue.length === 0;

      if (!queueEmpty) {
        emptySince = 0;
        return;
      }
      if (emptySince === 0) {
        emptySince = now;
        return;
      }
      if (now - emptySince < AUTOPILOT_EMPTY_THRESHOLD_MS) return;
      if (now - lastFillAt < AUTOPILOT_COOLDOWN_MS) return;

      const vibeKey =
        s.vibe && FALLBACK_TRACKS[s.vibe] ? s.vibe : "default";
      const pool = FALLBACK_TRACKS[vibeKey];
      const query = pool[Math.floor(Math.random() * pool.length)];
      socket.emit("add_song", { query });
      lastFillAt = now;
    };

    const id = setInterval(tick, AUTOPILOT_TICK_MS);
    return () => clearInterval(id);
  }, [me?.userId, state.hostUserId]);

  useEffect(() => {
    // Send join_room every time the socket (re)connects. This covers:
    //   - the initial connect on mount
    //   - React StrictMode's dev-mode disconnect + reconnect
    //   - real-world network blips (WiFi drops, tab backgrounding on iOS)
    // Always include the persisted identity so the server can reuse our
    // userId/name/avatar instead of spawning a fresh ghost on every reconnect.
    const onConnect = () => {
      socket.emit("join_room", {
        roomCode: code,
        existingIdentity: loadIdentity(),
      });
    };

    const onJoined = (payload) => {
      setMe(payload);
      saveIdentity({
        userId: payload.userId,
        name: payload.name,
        avatar: payload.avatar,
      });
    };

    const onRoomState = (snapshot) => {
      setState((prev) => ({
        ...prev,
        ...snapshot,
        skipVotes: snapshot.skipVotes ?? prev.skipVotes,
      }));
    };

    const onUserJoined = ({ userId, name, avatar }) => {
      setState((prev) => {
        if (prev.members.some((m) => m.userId === userId)) return prev;
        return {
          ...prev,
          members: [
            ...prev.members,
            { userId, name, avatar, joinedAt: Date.now() },
          ],
        };
      });
      pushToast({ kind: "join", name, avatar });
      bumpEnergy();
    };

    const onUserLeft = ({ userId, name, avatar }) => {
      setState((prev) => ({
        ...prev,
        members: prev.members.filter((m) => m.userId !== userId),
      }));
      if (name) pushToast({ kind: "leave", name, avatar });
    };

    const onQueueUpdated = ({ queue }) => {
      setState((prev) => ({ ...prev, queue }));
      bumpEnergy();
    };

    const onNowPlaying = (payload) => {
      setState((prev) => ({
        ...prev,
        currentTrack: payload.currentTrack,
        trackStartedAt: payload.trackStartedAt,
        trackDurationMs: payload.trackDurationMs,
        skipVotes: Array.isArray(payload.skipVotes) ? payload.skipVotes : [],
      }));
    };

    const onRoomUpdate = (patch = {}) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        if (typeof patch.energy === "number") {
          next.serverEnergy = patch.energy;
        }
        return next;
      });
    };

    const onJoinError = ({ error }) => {
      setError(error || "Could not join");
    };

    const onAddSongError = ({ error }) => {
      setError(error || "Could not add song");
      setTimeout(() => setError(""), 3000);
    };

    // Register `connect` BEFORE calling socket.connect() so the initial
    // connection's `connect` event is never missed.
    socket.on("connect", onConnect);
    socket.on("joined", onJoined);
    socket.on("room_state", onRoomState);
    socket.on("user_joined", onUserJoined);
    socket.on("user_left", onUserLeft);
    socket.on("queue_updated", onQueueUpdated);
    socket.on("now_playing", onNowPlaying);
    socket.on("room_update", onRoomUpdate);
    socket.on("join_error", onJoinError);
    socket.on("add_song_error", onAddSongError);

    socket.connect();
    // If the socket was already connected (HMR / StrictMode remount on an
    // already-open singleton), the `connect` event won't fire again, so
    // manually trigger a rejoin here too.
    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("joined", onJoined);
      socket.off("room_state", onRoomState);
      socket.off("user_joined", onUserJoined);
      socket.off("user_left", onUserLeft);
      socket.off("queue_updated", onQueueUpdated);
      socket.off("now_playing", onNowPlaying);
      socket.off("room_update", onRoomUpdate);
      socket.off("join_error", onJoinError);
      socket.off("add_song_error", onAddSongError);
      socket.disconnect();
    };
  }, [code, pushToast, bumpEnergy]);

  const copyLink = async () => {
    if (shareJoinUrl === null) return;
    try {
      await navigator.clipboard.writeText(shareJoinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable (insecure context); ignore.
    }
  };

  const energy = state.serverEnergy ?? localEnergy;

  const contextSnapshot = useCallback(() => {
    const s = stateRef.current;
    return {
      currentTrack: s.currentTrack
        ? {
            id: s.currentTrack.id,
            name: s.currentTrack.name,
            artist: s.currentTrack.artist,
          }
        : null,
      vibe: s.vibe,
      energy,
    };
  }, [energy]);

  const bubbles = useMemo(() => {
    return state.members.map((m, i) => {
      const hashSeed = [...m.userId].reduce(
        (acc, c) => acc + c.charCodeAt(0),
        0
      );
      const col = hashSeed % 90;
      return {
        ...m,
        left: 5 + col,
        size: 48 + ((hashSeed + i) % 24),
        delay: (hashSeed % 30) / 10,
        duration: 8 + ((hashSeed + i * 3) % 8),
        isHost: m.userId === state.hostUserId,
      };
    });
  }, [state.members, state.hostUserId]);

  if (error && !me) {
    return (
      <div className="ocean">
        <div className="landing">
          <div className="landingHero">
            <h1 className="landingTitle">Can't join {code}</h1>
            <p className="landingSubtitle">{error}</p>
            <button
              className="primaryBtn"
              onClick={() => (window.location.href = window.location.pathname)}
            >
              Back home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="ocean">
        <div className="landing">
          <div className="landingHero">
            <h1 className="landingTitle">Diving in...</h1>
            <p className="landingSubtitle">Joining room {code}</p>
          </div>
        </div>
      </div>
    );
  }

  // Derive host status reactively from the authoritative server state
  // instead of the one-shot `joined` payload. The server can re-assign host
  // via `room_update { hostUserId }` (e.g. after a StrictMode double-mount
  // or when the original host disconnects), and the UI must follow.
  const isHost = !!state.hostUserId && state.hostUserId === me.userId;

  if (isHost) {
    return (
      <HostView
        code={code}
        joinUrl={shareJoinUrl}
        me={me}
        state={state}
        bubbles={bubbles}
        energy={energy}
        toasts={toasts}
        expireToast={expireToast}
        copied={copied}
        copyLink={copyLink}
        contextSnapshot={contextSnapshot}
        error={error}
      />
    );
  }

  return (
    <GuestView
      code={code}
      me={me}
      state={state}
      bubbles={bubbles}
      error={error}
    />
  );
}
