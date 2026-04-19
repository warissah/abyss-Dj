import { useEffect, useRef, useState } from "react";

const LABELS = {
  chill: {
    low: "Calm tide",
    mid: "Easy current",
    high: "Deep flow",
  },
  hype: {
    low: "Charging up",
    mid: "Tide rising",
    high: "Peak vibes",
  },
  party: {
    low: "Pre-game",
    mid: "Crowd warming up",
    high: "Floor is on fire",
  },
  pop: {
    low: "Soft start",
    mid: "Hooks landing",
    high: "Sing-along storm",
  },
  trap: {
    low: "Low end idle",
    mid: "808s rolling",
    high: "Whole room shaking",
  },
  edm: {
    low: "Synths warming",
    mid: "Riding the build",
    high: "Drop city",
  },
  rock: {
    low: "Amps idle",
    mid: "Riffs locked in",
    high: "Full roar",
  },
  rnb: {
    low: "Silk mode",
    mid: "Heartbeat tempo",
    high: "Velvet peak",
  },
  sad: {
    low: "Quiet water",
    mid: "Heavy feelings",
    high: "Oceanic grief",
  },
  default: {
    low: "Listening in",
    mid: "Reading the room",
    high: "Dialed in",
  },
};

function bucket(e) {
  if (e >= 70) return "high";
  if (e >= 30) return "mid";
  return "low";
}

function labelFor(vibe, e) {
  const pool = LABELS[vibe] || LABELS.default;
  return pool[bucket(e)];
}

export default function EnergyBar({ energy = 30, vibe = "default" }) {
  const e = Math.max(0, Math.min(100, Math.round(energy)));
  const prevRef = useRef(e);
  const [spike, setSpike] = useState(false);

  useEffect(() => {
    if (e - prevRef.current >= 15) {
      setSpike(true);
      const t = setTimeout(() => setSpike(false), 600);
      prevRef.current = e;
      return () => clearTimeout(t);
    }
    prevRef.current = e;
  }, [e]);

  return (
    <div className="energyBarRow">
      <div className="energyBar" aria-label={`Room energy ${e}%`}>
        <div
          className={`energyBarFill${spike ? " energyBarFill--spike" : ""}`}
          style={{ width: `${e}%` }}
        />
      </div>
      <div className="energyBarLabel">
        {labelFor(vibe, e)} · {e}%
      </div>
    </div>
  );
}
