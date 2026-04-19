import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../socket.js";
import { saveIdentity } from "../lib/identity.js";
import AudioPlayer from "./AudioPlayer.jsx";
import Toasts from "./Toasts.jsx";
import ChatBar from "./ChatBar.jsx";
import LikeButton from "./LikeButton.jsx";
import SkipVote from "./SkipVote.jsx";
import AiDjChatter from "./AiDjChatter.jsx";
import VibeOrb from "./VibeOrb.jsx";

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
  serverEnergy: null, // null = use local estimate, number = override
};

// Energy estimator: count how many "notable" events happened in the last
// 60 seconds (joins, adds, likes, skips). Each event bumps the ring buffer;
// we recompute energy from it every 2s so the VibeOrb animates smoothly.
const ENERGY_WINDOW_MS = 60_000;
const ENERGY_PER_EVENT = 12; // 8 events in a minute -> near max
const ENERGY_REFRESH_MS = 2000;

export default function Room({ code }) {
  const [me, setMe] = useState(null);
  const [state, setState] = useState({ ...INITIAL_STATE, code });
  const [toasts, setToasts] = useState([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [localEnergy, setLocalEnergy] = useState(30);

  // Ref always holds the latest state for the ChatBar context snapshot.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Event pulse buffer for the local energy estimator.
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

  // Recompute local energy on an interval so it decays naturally.
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

  useEffect(() => {
    socket.connect();
    socket.emit("join_room", { roomCode: code });

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
        // Reset skip votes whenever the track changes unless the payload
        // explicitly includes a new list (teammate's backend will).
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

    socket.on("joined", onJoined);
    socket.on("room_state", onRoomState);
    socket.on("user_joined", onUserJoined);
    socket.on("user_left", onUserLeft);
    socket.on("queue_updated", onQueueUpdated);
    socket.on("now_playing", onNowPlaying);
    socket.on("room_update", onRoomUpdate);
    socket.on("join_error", onJoinError);
    socket.on("add_song_error", onAddSongError);

    return () => {
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
    try {
      const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const energy = state.serverEnergy ?? localEnergy;

  // Snapshot passed to ChatBar so dj_request carries current context.
  const contextSnapshot = useCallback(() => {
    const s = stateRef.current;
    return {
      currentTrack: s.currentTrack
        ? { id: s.currentTrack.id, name: s.currentTrack.name, artist: s.currentTrack.artist }
        : null,
      vibe: s.vibe,
      energy,
    };
  }, [energy]);

  // Deterministic bubble column per member so layout is stable across renders.
  const bubbles = useMemo(() => {
    return state.members.map((m, i) => {
      const hashSeed = [...m.userId].reduce((acc, c) => acc + c.charCodeAt(0), 0);
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

  return (
    <div className="ocean">
      {/* VIBE ORB (sits behind everything inside .ocean) */}
      <VibeOrb vibe={state.vibe} energy={energy} />

      {/* BUBBLES */}
      <div className="bubbles">
        {bubbles.map((u) => (
          <div
            key={u.userId}
            className={`bubble ${u.isHost ? "bubble-host" : ""}`}
            style={{
              left: `${u.left}%`,
              width: `${u.size}px`,
              height: `${u.size}px`,
              animationDuration: `${u.duration}s`,
              animationDelay: `${u.delay}s`,
            }}
          >
            <div className="ring" />
            <div className="avatar">{u.avatar}</div>
            {u.isHost && <div className="crown">👑</div>}
            <div className="bubbleName">{u.name}</div>
          </div>
        ))}
      </div>

      {/* TOP BAR */}
      <div className="topBar">
        <h2>🌊 VIBE: {state.vibe}</h2>
        <div className="topBarMeta">
          Room {code} · {state.members.length}{" "}
          {state.members.length === 1 ? "listener" : "listeners"}
        </div>
      </div>

      {/* SHARE PILL */}
      <button className="sharePill" onClick={copyLink}>
        {copied ? "Link copied!" : `Share ${code}`}
      </button>

      {/* CENTER */}
      <div className="center">
        <div className="nowPlayingStage">
          <div className="discContainer">
            {state.currentTrack && (
              <div className="audioRing">
                {Array.from({ length: 18 }).map((_, i) => (
                  <span
                    key={i}
                    style={{
                      transform: `rotate(${i * 20}deg) translateY(-120px)`,
                      animationDelay: `${i * 0.05}s`,
                    }}
                  />
                ))}
              </div>
            )}

            <div
              className="disc"
              style={
                state.currentTrack?.albumArt
                  ? {
                      backgroundImage: `url(${state.currentTrack.albumArt})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }
                  : undefined
              }
            />
          </div>

          <div className="trackInfo">
            <h2>{state.currentTrack?.name || "Nothing playing"}</h2>
            <p>{state.currentTrack?.artist || "Queue a song below"}</p>
          </div>

          {state.currentTrack && (
            <div className="nowPlayingControls">
              <LikeButton
                track={state.currentTrack}
                myUserId={me?.userId}
                size="lg"
              />
              <SkipVote
                trackId={state.currentTrack.id}
                memberCount={state.members.length}
                skipVotes={state.skipVotes}
                myUserId={me?.userId}
              />
            </div>
          )}

          <AiDjChatter vibe={state.vibe} />

          <AudioPlayer
            currentTrack={state.currentTrack}
            trackStartedAt={state.trackStartedAt}
            trackDurationMs={state.trackDurationMs}
          />
        </div>
      </div>

      {/* QUEUE */}
      <div className="queue">
        <h3>Queue</h3>
        {state.queue.length === 0 ? (
          <p className="queueEmpty">No songs yet</p>
        ) : (
          state.queue.map((song, i) => (
            <div key={`${song.id}-${i}`} className="queueItem">
              <div className="queueItemMain">
                <div className="queueItemTitle">{song.name}</div>
                <div className="queueItemMeta">
                  {song.artist}
                  {song.vibe ? ` · ${song.vibe}` : ""}
                </div>
              </div>
              <LikeButton track={song} myUserId={me?.userId} size="sm" />
            </div>
          ))
        )}
      </div>

      {/* TOASTS */}
      <Toasts toasts={toasts} onExpire={expireToast} />

      {/* CHAT BAR (intent-aware) */}
      <ChatBar contextSnapshot={contextSnapshot} />

      {error && me && <div className="errorBanner">{error}</div>}
    </div>
  );
}
