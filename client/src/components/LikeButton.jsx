import { useMemo, useState } from "react";
import { socket } from "../socket.js";

// Heart toggle for a track. Parent passes in the current track (reads
// track.likes / track.likedBy when the server supplies them) and the
// local viewer's userId so we can compute "did I already like this".
//
// Emits `like_track { trackId }` / `unlike_track { trackId }`.
// Falls back to pure local state until the backend echoes likes, so the
// heart still toggles during solo demos -- but in that case the counter
// will only ever read 1 (your own like). That's intentional.
export default function LikeButton({ track, myUserId, size = "md" }) {
  const [localLiked, setLocalLiked] = useState(false);

  const serverLikedBy = Array.isArray(track?.likedBy) ? track.likedBy : null;

  const liked = useMemo(() => {
    if (serverLikedBy && myUserId) return serverLikedBy.includes(myUserId);
    return localLiked;
  }, [serverLikedBy, myUserId, localLiked]);

  const count = useMemo(() => {
    if (typeof track?.likes === "number") return track.likes;
    if (serverLikedBy) return serverLikedBy.length;
    return localLiked ? 1 : 0;
  }, [track, serverLikedBy, localLiked]);

  if (!track?.id) return null;

  const toggle = (e) => {
    e.stopPropagation();
    const nextLiked = !liked;
    setLocalLiked(nextLiked);
    socket.emit(nextLiked ? "like_track" : "unlike_track", {
      trackId: track.id,
    });
  };

  return (
    <button
      className={`likeBtn likeBtn-${size} ${liked ? "likeBtn-on" : ""}`}
      onClick={toggle}
      aria-pressed={liked}
      title={liked ? "Unlike" : "Like"}
    >
      <span className="likeHeart" aria-hidden="true">
        {liked ? "♥" : "♡"}
      </span>
      {count > 0 && <span className="likeCount">{count}</span>}
    </button>
  );
}
