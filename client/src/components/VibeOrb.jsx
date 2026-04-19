// Soft glowing orb behind the disc. Two inputs:
//   - vibe:   string -> picks a hue via an ocean.css class name
//   - energy: 0-100  -> drives pulse speed + scale via inline CSS vars
//
// The parent is responsible for producing `energy`: either straight from a
// server `room_update { energy }` patch, or a client-side rolling estimate.
// Component itself has no state.
export default function VibeOrb({ vibe, energy = 50 }) {
  const vibeClass = `vibeOrb-${vibe || "default"}`;

  // Normalize and map energy to CSS custom properties.
  const e = Math.max(0, Math.min(100, energy));
  const pulseDuration = 6 - (e / 100) * 4; // 6s at 0 energy, 2s at 100
  const scaleBoost = 1 + (e / 100) * 0.25; // 1.00 -> 1.25
  const opacity = 0.35 + (e / 100) * 0.35; // 0.35 -> 0.70

  return (
    <div
      className={`vibeOrb ${vibeClass}`}
      style={{
        "--vibe-pulse": `${pulseDuration}s`,
        "--vibe-scale": scaleBoost,
        "--vibe-opacity": opacity,
      }}
      aria-hidden="true"
    />
  );
}
