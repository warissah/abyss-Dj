import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../socket.js";
import { saveIdentity } from "../lib/identity.js";
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

// Orchestrator. Owns the socket connection + shared room state, then hands
// off rendering to either HostView (full dashboard) or GuestView (minimal
// add-a-song UI) based on the identity assigned by the server.
export default function Room({ code }) {
  const [me, setMe] = useState(null);
  const [state, setState] = useState({ ...INITIAL_STATE, code });
  const [toasts, setToasts] = useState([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [localEnergy, setLocalEnergy] = useState(30);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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
