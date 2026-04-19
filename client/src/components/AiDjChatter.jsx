import { useEffect, useState } from "react";
import { socket } from "../socket.js";
import { pickMessage } from "../lib/djMessages.js";

const ROTATE_MS = 8000;
const SERVER_MESSAGE_HOLD_MS = 6000;

// Flavor text under the disc. Two modes:
//   - "local": rotates random messages from djMessages every ~8s, keyed to
//     the current vibe. Fully client-side; works with zero backend help.
//   - "server": if the backend ever emits `ai_message { text }`, we pin
//     that for a few seconds before resuming local cycling.
export default function AiDjChatter({ vibe }) {
  const [text, setText] = useState(() => pickMessage(vibe));
  const [fadeKey, setFadeKey] = useState(0);
  const [serverUntil, setServerUntil] = useState(0);

  // Local rotation.
  useEffect(() => {
    // Instant switch when vibe changes so it feels reactive.
    let t0 = null;
    if (Date.now() >= serverUntil) {
      t0 = setTimeout(() => {
        setText(pickMessage(vibe));
        setFadeKey((k) => k + 1);
      }, 0);
    }

    const tick = () => {
      if (Date.now() < serverUntil) return;
      setText(pickMessage(vibe));
      setFadeKey((k) => k + 1);
    };

    const id = setInterval(tick, ROTATE_MS);
    return () => {
      clearInterval(id);
      if (t0) clearTimeout(t0);
    };
  }, [vibe, serverUntil]);

  // Server-driven override.
  useEffect(() => {
    const onAiMessage = ({ text: serverText }) => {
      if (!serverText) return;
      setText(serverText);
      setFadeKey((k) => k + 1);
      setServerUntil(Date.now() + SERVER_MESSAGE_HOLD_MS);
    };

    socket.on("ai_message", onAiMessage);
    return () => socket.off("ai_message", onAiMessage);
  }, []);

  return (
    <div className="aiMessageBig">
      <span key={fadeKey} className="djChatterText">
        {text}
      </span>
    </div>
  );
}
