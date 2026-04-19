import { useEffect, useRef, useState } from "react";

// Synchronized 30-second-preview player.
// - Whenever (currentTrack, trackStartedAt) changes, we load the preview
//   and seek to (Date.now() - trackStartedAt) so late joiners fall in sync
//   with whatever everyone else is hearing.
// - Browsers block audio.play() without a user gesture. If that happens we
//   render a "Tap to start audio" overlay and retry play on the next gesture.
export default function AudioPlayer({ currentTrack, trackStartedAt, trackDurationMs }) {
  const audioRef = useRef(null);
  const [needsGesture, setNeedsGesture] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentTrack?.preview_url) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      return;
    }

    audio.src = currentTrack.preview_url;

    const offsetSec = Math.max(
      0,
      Math.min(
        (Date.now() - trackStartedAt) / 1000,
        (trackDurationMs - 500) / 1000
      )
    );

    const onLoaded = () => {
      try {
        audio.currentTime = offsetSec;
      } catch {
        // Some browsers refuse seeking before metadata fully loads; ignore.
      }
      const p = audio.play();
      if (p && typeof p.catch === "function") {
        p.then(() => setNeedsGesture(false)).catch(() => setNeedsGesture(true));
      }
    };

    audio.addEventListener("loadedmetadata", onLoaded, { once: true });
    audio.load();

    return () => audio.removeEventListener("loadedmetadata", onLoaded);
  }, [currentTrack?.id, currentTrack?.preview_url, trackStartedAt, trackDurationMs]);

  const handleTap = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().then(() => setNeedsGesture(false)).catch(() => {});
  };

  return (
    <>
      <audio ref={audioRef} preload="auto" />
      {needsGesture && currentTrack?.preview_url && (
        <button className="autoplayOverlay" onClick={handleTap}>
          Tap to start audio
        </button>
      )}
      {currentTrack && !currentTrack.preview_url && (
        <div className="noPreview">No preview available for this track</div>
      )}
    </>
  );
}
