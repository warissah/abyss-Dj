import { useEffect, useState, useMemo } from "react";
import { socket } from "./socket";
import "./styles/ocean.css";

export default function App() {
  const [state, setState] = useState({
    queue: [],
    currentTrack: null,
    vibe: "loading",
    energy: 50,
    aiMessage: "🌊 Let the ocean guide the rhythm...",
  });

  const [input, setInput] = useState("");

  const users = [
    { id: 1, avatar: "🦑", activity: 80 },
    { id: 2, avatar: "🐙", activity: 60 },
    { id: 3, avatar: "🐠", activity: 40 },
    { id: 4, avatar: "🪼", activity: 90 },
    { id: 5, avatar: "🐡", activity: 70 },
  ];

  useEffect(() => {
    socket.on("update", (data) => {
      setState((prev) => ({
        ...prev,
        ...data,
        energy: Math.floor(Math.random() * 100),
      }));
    });

    return () => socket.off("update");
  }, []);

  const sendRequest = () => {
    if (!input.trim()) return;

    socket.emit("user_request", {
      prompt: input,
      context: {
        currentTrack: state.currentTrack,
        vibe: state.vibe,
        energy: state.energy,
      },
    });

    setInput("");
  };

  const bubbles = useMemo(() => {
    return users.map((u, i) => ({
      ...u,
      left: 10 + i * 18,
      delay: i * 0.6,
      size: 40 + (u.activity % 20),
    }));
  }, []);

  return (
    <div className="ocean">

      {/* ================= BUBBLES ================= */}
      <div className="bubbles">
        {bubbles.map((u) => (
          <div
            key={u.id}
            className="bubble"
            style={{
              left: `${u.left}%`,
              width: `${u.size}px`,
              height: `${u.size}px`,
              animationDuration: `${10 - u.activity / 15}s`,
              animationDelay: `${u.delay}s`,
            }}
          >
            <div className="ring" />
            <div className="avatar">{u.avatar}</div>
          </div>
        ))}
      </div>

      {/* ================= TOP BAR ================= */}
      <div className="topBar">
        <h2>🌊 VIBE: {state.vibe}</h2>
      </div>

      {/* ================= CENTER ================= */}
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

            <div className="disc" />
          </div>

          <div className="trackInfo">
            <h2>{state.currentTrack?.name || "No track playing"}</h2>
            <p>{state.currentTrack?.artist || "AI DJ System"}</p>
          </div>

          <div className="aiMessageBig">
            {state.aiMessage}
          </div>

        </div>

      </div>

      {/* ================= QUEUE ================= */}
      <div className="queue">
        <h3>Queue</h3>

        {state.queue?.length === 0 ? (
          <p>No songs yet</p>
        ) : (
          state.queue.map((song, i) => (
            <div key={i} className="queueItem">
              {song.song || song.name} — {song.artist}
            </div>
          ))
        )}
      </div>

      {/* ================= ONLY CHAT BAR ================= */}
      <div className="chatBar">
        <input
          className="chatInput"
          placeholder="Type your vibe... (e.g. play something chill)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendRequest()}
        />

        <button className="chatButton" onClick={sendRequest}>
          →
        </button>
      </div>

    </div>
  );
}
