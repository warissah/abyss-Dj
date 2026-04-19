import AudioPlayer from "./AudioPlayer.jsx";
import Toasts from "./Toasts.jsx";
import ChatBar from "./ChatBar.jsx";
import LikeButton from "./LikeButton.jsx";
import SkipVote from "./SkipVote.jsx";
import AiDjChatter from "./AiDjChatter.jsx";
import VibeOrb from "./VibeOrb.jsx";
import EnergyBar from "./EnergyBar.jsx";
import FakeActivityFeed from "./FakeActivityFeed.jsx";
import OceanAmbience from "./OceanAmbience.jsx";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";

// Full host dashboard: now-playing disc, queue, vibe orb, DJ chat bar, audio.
// This is the original Room layout, now rendered only when me.isHost === true.
export default function HostView({
  code,
  joinUrl,
  me,
  state,
  bubbles,
  energy,
  toasts,
  expireToast,
  copied,
  copyLink,
  contextSnapshot,
  error,
}) {
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <div className="ocean">
      <OceanAmbience />
      <VibeOrb vibe={state.vibe} energy={energy} />

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
        <h2>🌊 VIBE: {state.vibe}</h2>
        <EnergyBar energy={energy} vibe={state.vibe} />
        <div className="topBarMeta">
          Room {code} · {state.members.length}{" "}
          {state.members.length === 1 ? "listener" : "listeners"} · host
        </div>
      </div>

      <FakeActivityFeed />

      <button
        className="sharePill"
        onClick={() => setShareOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={shareOpen}
      >
        {copied ? "Link copied!" : `Share ${code}`}
      </button>

      {shareOpen && (
        <>
          <button
            type="button"
            className="sharePopoverBackdrop"
            onClick={() => setShareOpen(false)}
            aria-label="Close share"
          />
          <div className="sharePopover" role="dialog" aria-label="Share room">
            <div className="sharePopoverCard">
              <div className="sharePopoverTitle">Scan to join Room {code}</div>
              <div className="sharePopoverQr">
                {joinUrl ? (
                  <QRCodeSVG
                    value={joinUrl}
                    size={220}
                    level="M"
                    includeMargin
                  />
                ) : (
                  <div className="sharePopoverQrPending">
                    Finding this computer on the network…
                  </div>
                )}
              </div>
              <div className="sharePopoverUrl" title={joinUrl || ""}>
                {joinUrl || "—"}
              </div>
              <div className="sharePopoverActions">
                <button
                  type="button"
                  className="sharePopoverCopyBtn"
                  onClick={copyLink}
                  disabled={!joinUrl}
                >
                  Copy link
                </button>
                <button
                  type="button"
                  className="sharePopoverCloseBtn"
                  onClick={() => setShareOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}

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

      <Toasts toasts={toasts} onExpire={expireToast} />

      <ChatBar contextSnapshot={contextSnapshot} />

      {error && <div className="errorBanner">{error}</div>}
    </div>
  );
}
