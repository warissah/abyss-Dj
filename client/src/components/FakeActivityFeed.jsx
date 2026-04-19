import { useEffect, useRef, useState } from "react";

const EMOJIS = ["🐠", "🦑", "🐙", "🐬", "🐟", "🦈", "🪼", "🐡", "🦀", "🐚"];

const NAME_POOL = [
  "deepDiver",
  "reefRider",
  "tidalPulse",
  "abyssWalker",
  "kelpKing",
  "coralCrush",
  "nautilus",
  "brineBandit",
  "mistCurrent",
  "echoDepth",
];

const FIRST_MSG_MIN_MS = 5_000;
const FIRST_MSG_MAX_MS = 10_000;
const NEXT_MSG_MIN_MS = 15_000;
const NEXT_MSG_MAX_MS = 35_000;
const MAX_VISIBLE = 3;

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fakeName() {
  if (Math.random() < 0.5) {
    return `guest${rand(1000, 9999)}`;
  }
  return `${pick(NAME_POOL)}${rand(10, 99)}`;
}

export default function FakeActivityFeed() {
  const [items, setItems] = useState([]);
  const idRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const pushOne = () => {
      if (cancelled) return;
      idRef.current += 1;
      const item = {
        id: idRef.current,
        emoji: pick(EMOJIS),
        name: fakeName(),
      };
      setItems((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), item]);
      schedule(NEXT_MSG_MIN_MS, NEXT_MSG_MAX_MS);
    };

    const schedule = (min, max) => {
      if (cancelled) return;
      timer = setTimeout(pushOne, rand(min, max));
    };

    schedule(FIRST_MSG_MIN_MS, FIRST_MSG_MAX_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fakeActivityFeed" aria-hidden="true">
      {items.map((it, i) => {
        const isNewest = i === items.length - 1;
        return (
          <div
            key={it.id}
            className={`fakeActivityItem${isNewest ? "" : " fakeActivityItem--fading"}`}
          >
            <span className="fakeActivityEmoji">{it.emoji}</span>
            <span className="fakeActivityName">{it.name}</span>
            <span className="fakeActivityVerb">joined the party</span>
          </div>
        );
      })}
    </div>
  );
}
