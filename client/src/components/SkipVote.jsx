import { useEffect, useMemo, useState } from "react";
import { socket } from "../socket.js";

// Community-skip button. Visible whenever a track is currently playing.
//
// Truth-source precedence:
//   1) `skipVotes: string[]` on the latest now_playing payload (server-driven)
//   2) Local "did I click it" state (fallback while backend isn't implemented)
//
// Emits `vote_skip {}` / `unvote_skip {}`. The server is expected to
// advance the track when skipVotes.length >= ceil(memberCount / 2).
export default function SkipVote({
  trackId,
  memberCount,
  skipVotes,
  myUserId,
}) {
  const [localVoted, setLocalVoted] = useState(false);
  const [flash, setFlash] = useState(false);

  // Any time the track changes, reset local vote (the server would too).
  useEffect(() => {
    setLocalVoted(false);
    setFlash(false);
  }, [trackId]);

  const serverList = Array.isArray(skipVotes) ? skipVotes : null;

  const voted = useMemo(() => {
    if (serverList && myUserId) return serverList.includes(myUserId);
    return localVoted;
  }, [serverList, myUserId, localVoted]);

  const votes = serverList
    ? serverList.length
    : localVoted
    ? 1
    : 0;

  const threshold = Math.max(1, Math.ceil((memberCount || 1) / 2));

  useEffect(() => {
    if (votes >= threshold && votes > 0) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 700);
      return () => clearTimeout(t);
    }
  }, [votes, threshold]);

  if (!trackId) return null;

  const toggle = () => {
    const nextVoted = !voted;
    setLocalVoted(nextVoted);
    socket.emit(nextVoted ? "vote_skip" : "unvote_skip", {});
  };

  return (
    <button
      className={`skipBtn ${voted ? "skipBtn-on" : ""} ${flash ? "skipBtn-flash" : ""}`}
      onClick={toggle}
      aria-pressed={voted}
      title={voted ? "Take back your skip vote" : "Vote to skip this track"}
    >
      <span className="skipIcon" aria-hidden="true">⏭</span>
      <span className="skipLabel">
        Skip{" "}
        <span className="skipCount">
          ({votes}/{threshold})
        </span>
      </span>
    </button>
  );
}
