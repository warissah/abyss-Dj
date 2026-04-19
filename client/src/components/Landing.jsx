import { useMemo, useState } from "react";
import { BACKEND_URL } from "../socket.js";
import { previewIdentity } from "../lib/identity.js";

export default function Landing() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const preview = useMemo(() => previewIdentity(), []);

  const goToRoom = (roomCode) => {
    const normalized = String(roomCode).trim().toUpperCase();
    if (!normalized) return;
    // Keep it in ?room=CODE so a copy/paste of the URL drops the next user
    // directly into the room.
    window.location.href = `${window.location.pathname}?room=${normalized}`;
  };

  const createRoom = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${BACKEND_URL}/rooms`, { method: "POST" });
      if (!res.ok) throw new Error(`Server ${res.status}`);
      const data = await res.json();
      if (!data.roomCode) throw new Error("No room code returned");
      goToRoom(data.roomCode);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const joinRoom = async () => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${BACKEND_URL}/rooms/${normalized}`);
      const data = await res.json();
      if (!data.exists) {
        setError("Room not found");
        setBusy(false);
        return;
      }
      goToRoom(normalized);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="ocean">
      <div className="landing">
        <div className="landingHero">
          <div className="landingAvatar">{preview.avatar}</div>
          <h1 className="landingTitle">Abyss Vibe DJ</h1>
          <p className="landingSubtitle">
            Drop in. Queue a song. Let the ocean mix the vibe.
          </p>
          <p className="landingIdentity">
            You'll appear as{" "}
            <strong>
              {preview.avatar} {preview.name}
            </strong>
          </p>
        </div>

        <div className="landingActions">
          <button
            className="primaryBtn"
            onClick={createRoom}
            disabled={busy}
          >
            {busy ? "Summoning..." : "Create room"}
          </button>

          <div className="landingDivider">or</div>

          <div className="joinRow">
            <input
              className="codeInput"
              placeholder="ROOM CODE"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && joinRoom()}
            />
            <button
              className="secondaryBtn"
              onClick={joinRoom}
              disabled={busy || !code.trim()}
            >
              Join
            </button>
          </div>

          {error && <div className="landingError">{error}</div>}
        </div>
      </div>
    </div>
  );
}
