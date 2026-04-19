import { useEffect, useRef, useState } from "react";
import { socket } from "../socket.js";
import OceanAmbience from "./OceanAmbience.jsx";
import SkipVote from "./SkipVote.jsx";

const ADD_CONFIRM_MS = 2500;
const HEART_TAP_MIN_MS = 200;
const FLOATER_LIFE_MS = 800;

function GuestHeartDock({ np }) {
  const [myTaps, setMyTaps] = useState(0);
  const [heartPopKey, setHeartPopKey] = useState(0);
  const [floaters, setFloaters] = useState([]);
  const lastTapRef = useRef(0);
  const floaterIdRef = useRef(0);

  const tapHeart = () => {
    if (!np) return;
    const now = Date.now();
    if (now - lastTapRef.current < HEART_TAP_MIN_MS) return;
    lastTapRef.current = now;
    setMyTaps((n) => n + 1);
    setHeartPopKey((k) => k + 1);
    floaterIdRef.current += 1;
    const id = floaterIdRef.current;
    setFloaters((prev) => [...prev, { id }]);
    setTimeout(() => {
      setFloaters((prev) => prev.filter((f) => f.id !== id));
    }, FLOATER_LIFE_MS);
  };

  const heartDisabled = !np;

  return (
    <div className="guestHeartDock">
      <button
        type="button"
        className={`guestHeartBtn${heartDisabled ? " guestHeartBtn--disabled" : ""}`}
        onClick={tapHeart}
        disabled={heartDisabled}
        aria-label="Send a heart"
      >
        <span key={heartPopKey} className="guestHeartGlyph">
          ♥
        </span>
        {floaters.map((f) => (
          <span key={f.id} className="guestHeartFloater">
            +1
          </span>
        ))}
      </button>
      {myTaps > 0 && <div className="guestHeartCount">{myTaps}</div>}
    </div>
  );
}

// Minimal guest experience: see what's playing right now (read-only, no audio
// on this device) and drop song requests into the shared queue. No queue
// browsing, no DJ chat, no skip/like. The AI on the server will decide what
// plays next based on everyone's adds.
export default function GuestView({ code, me, state, bubbles, error }) {
  const [query, setQuery] = useState("");
  const [lastAdded, setLastAdded] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const confirmTimerRef = useRef(null);
  const errTimerRef = useRef(null);

  useEffect(() => {
    const onAddError = ({ error: msg }) => {
      setErrMsg(msg || "Could not add song");
      clearTimeout(errTimerRef.current);
      errTimerRef.current = setTimeout(() => setErrMsg(""), 3000);
    };
    socket.on("add_song_error", onAddError);
    return () => {
      socket.off("add_song_error", onAddError);
      clearTimeout(confirmTimerRef.current);
      clearTimeout(errTimerRef.current);
    };
  }, []);

  const addSong = (e) => {
    e?.preventDefault?.();
    const text = query.trim();
    if (!text) return;
    socket.emit("add_song", { query: text });
    setLastAdded(text);
    setQuery("");
    clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = setTimeout(() => setLastAdded(""), ADD_CONFIRM_MS);
  };

  const np = state.currentTrack;
  const myId = me?.userId;
  const playingIsMine = !!(np && myId && np.addedBy === myId);
  const nextUp = state.queue?.[0];
  const nextIsMine = !!(nextUp && myId && nextUp.addedBy === myId);

  return (
    <div className="ocean">
      <OceanAmbience />
      <GuestHeartDock key={np?.id ?? "none"} np={np} />

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

      <div className="topBar">
        <h2>🌊 Room {code}</h2>
        <div className="topBarMeta">
          You're {me?.avatar} {me?.name} · guest
        </div>
      </div>

      <div className="guestStage">
        <div className="guestNowCard">
          <div
            className="guestNowArt"
            style={
              np?.albumArt
                ? {
                    backgroundImage: `url(${np.albumArt})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
          >
            {!np?.albumArt && <span className="guestNowArtEmoji">🎧</span>}
          </div>
          <div className="guestNowText">
            <span className="guestNowLabel">{np ? "NOW PLAYING" : "GETTING READY"}</span>
            <h2 className="guestNowTitle">
              {np?.name || "Warming up the speakers..."}
            </h2>
            <p className="guestNowArtist">
              {np?.artist || "Your host will start soon"}
            </p>
            {!np && (
              <div className="guestEq" aria-label="Equalizer animation">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            )}
            {np?.vibe && <span className="guestNowVibe">vibe: {np.vibe}</span>}
            {!np && state.vibe && state.vibe !== "loading" && (
              <span className="guestNowVibe">vibe: {state.vibe}</span>
            )}
            {playingIsMine && (
              <span className="guestHintChip">🎧 Your song is playing now</span>
            )}
            {!playingIsMine && nextIsMine && (
              <span className="guestHintChip">🎯 Your pick is next</span>
            )}
          </div>
        </div>

        {np && (
          <div className="guestSkipRow">
            <SkipVote
              trackId={np.id}
              memberCount={state.members.length}
              skipVotes={state.skipVotes}
              myUserId={me?.userId}
            />
          </div>
        )}

        <form className="guestAddForm" onSubmit={addSong}>
          <input
            className="guestAddInput"
            placeholder="Add a song (e.g. Uptown Funk Bruno Mars)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="submit"
            className="guestAddBtn"
            disabled={!query.trim()}
          >
            Queue it
          </button>
        </form>

        {lastAdded && (
          <div className="guestToast guestToastOk">
            Added <strong>{lastAdded}</strong> — the DJ will decide when it plays
          </div>
        )}
        {errMsg && <div className="guestToast guestToastErr">{errMsg}</div>}
        {error && !errMsg && (
          <div className="guestToast guestToastErr">{error}</div>
        )}
      </div>
    </div>
  );
}
