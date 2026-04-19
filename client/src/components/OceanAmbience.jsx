const BUBBLE_COUNT = 18;

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

const BUBBLES = Array.from({ length: BUBBLE_COUNT }, () => ({
  left: rand(0, 100),
  size: rand(4, 14),
  duration: rand(8, 22),
  delay: rand(0, 12),
  drift: rand(-10, 10),
  opacity: rand(0.25, 0.7),
}));

// Decorative deep-sea ambience: rising bubbles, slow surface waves, and faint
// neon light rays from above. No props, no state, no socket work. Rendered
// behind the UI (z-index 0) on both host and guest.
export default function OceanAmbience() {
  return (
    <div className="oceanAmbienceRoot" aria-hidden="true">
      <div className="seaWaveLayer">
        <svg
          className="seaWave"
          viewBox="0 0 1440 120"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="seaWaveGradA" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0, 229, 255, 0.55)" />
              <stop offset="100%" stopColor="rgba(0, 229, 255, 0)" />
            </linearGradient>
          </defs>
          <path
            d="M0,60 C180,20 360,100 720,60 C1080,20 1260,100 1440,60 L1440,0 L0,0 Z
               M1440,60 C1620,20 1800,100 2160,60 C2520,20 2700,100 2880,60 L2880,0 L1440,0 Z"
            fill="url(#seaWaveGradA)"
          />
        </svg>
        <svg
          className="seaWave seaWave--alt"
          viewBox="0 0 1440 120"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="seaWaveGradB" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(158, 252, 255, 0.45)" />
              <stop offset="100%" stopColor="rgba(0, 229, 255, 0)" />
            </linearGradient>
          </defs>
          <path
            d="M0,70 C240,30 480,110 720,70 C960,30 1200,110 1440,70 L1440,0 L0,0 Z
               M1440,70 C1680,30 1920,110 2160,70 C2400,30 2640,110 2880,70 L2880,0 L1440,0 Z"
            fill="url(#seaWaveGradB)"
          />
        </svg>
      </div>

      <div className="seaRays">
        <span className="seaRay seaRay--left" />
        <span className="seaRay seaRay--right" />
      </div>

      <div className="seaAmbience">
        {BUBBLES.map((b, i) => (
          <span
            key={i}
            className="seaBubble"
            style={{
              left: `${b.left}%`,
              width: `${b.size}px`,
              height: `${b.size}px`,
              animationDuration: `${b.duration}s`,
              animationDelay: `${b.delay}s`,
              "--bub-drift": `${b.drift}px`,
              "--bub-op": b.opacity,
            }}
          />
        ))}
      </div>
    </div>
  );
}
