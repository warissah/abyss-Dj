import { useEffect, useRef, useState } from "react";
import { socket } from "../socket.js";
import { classifyChat } from "../lib/intent.js";

const THINKING_TIMEOUT_MS = 8000;
const REPLY_VISIBLE_MS = 6000;

// Smart chat bar. Classifies input via intent.js:
//   - dj_request -> emits `dj_request { prompt, context }` and waits up to
//     8s for `dj_response { reply, addedTracks }`, showing a thinking dots
//     indicator and then the reply bubble for 6s.
//   - add_song   -> emits `add_song { query }` (the existing Tier-1 event).
//
// Gracefully degrades when the backend hasn't implemented dj_request yet:
// after the timeout we clear the thinking state and tell the user.
export default function ChatBar({ contextSnapshot }) {
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [reply, setReply] = useState(null); // { text } | null
  const [error, setError] = useState("");

  const thinkingTimerRef = useRef(null);
  const replyTimerRef = useRef(null);

  useEffect(() => {
    const onDjResponse = ({ reply: text }) => {
      clearTimeout(thinkingTimerRef.current);
      setThinking(false);
      if (text) {
        setReply({ text });
        clearTimeout(replyTimerRef.current);
        replyTimerRef.current = setTimeout(() => setReply(null), REPLY_VISIBLE_MS);
      }
    };

    socket.on("dj_response", onDjResponse);
    return () => {
      socket.off("dj_response", onDjResponse);
      clearTimeout(thinkingTimerRef.current);
      clearTimeout(replyTimerRef.current);
    };
  }, []);

  const send = () => {
    const { kind, text } = classifyChat(input);
    if (kind === "noop") return;

    if (kind === "dj_request") {
      socket.emit("dj_request", {
        prompt: text,
        context: contextSnapshot ? contextSnapshot() : {},
      });
      setThinking(true);
      setError("");
      clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = setTimeout(() => {
        setThinking(false);
        setError("DJ didn't respond, try again");
        setTimeout(() => setError(""), 3000);
      }, THINKING_TIMEOUT_MS);
    } else {
      socket.emit("add_song", { query: text });
    }

    setInput("");
  };

  return (
    <>
      {reply && (
        <div className="djReplyBubble" role="status" aria-live="polite">
          <span className="djReplyAvatar">🎧</span>
          <span>{reply.text}</span>
        </div>
      )}

      {error && <div className="djReplyBubble djReplyError">{error}</div>}

      <div className={`chatBar ${thinking ? "chatBar-thinking" : ""}`}>
        <input
          className="chatInput"
          placeholder={
            thinking
              ? "DJ is thinking..."
              : "Type a song or ask the DJ (e.g. play something chill)"
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !thinking && send()}
          disabled={thinking}
        />

        {thinking ? (
          <span className="thinkingDots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        ) : (
          <button
            className="chatButton"
            onClick={send}
            disabled={!input.trim()}
          >
            →
          </button>
        )}
      </div>
    </>
  );
}
