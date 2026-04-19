// Vibe-keyed pools of AI personality messages used by <AiDjChatter />.
// Purely client-side flavor text; if the backend starts emitting
// `ai_message { text }` we prefer that instead.

export const DJ_MESSAGES = {
  chill: [
    "Keeping it smooth",
    "Letting the current carry us",
    "Easy waves, easy breathing",
    "Cooling the tempo down",
    "Drifting into slower water",
  ],
  hype: [
    "Turning up the energy",
    "Waves rising",
    "Hold on, we're lifting off",
    "Pushing the BPM up",
    "Tide's coming in hot",
  ],
  party: [
    "Dance floor calling",
    "Bass incoming",
    "Everyone on the reef, move",
    "Full volume, full vibe",
    "Glow it up",
  ],
  pop: [
    "Shiny hooks incoming",
    "Catchy frequencies loaded",
    "Bright and bubbly mode",
    "Sing-along territory",
  ],
  trap: [
    "808s about to hit",
    "Low end loaded",
    "Sliding into the dark end",
    "Trap set engaged",
  ],
  edm: [
    "Drop imminent",
    "Synths are warming up",
    "Riding the build",
    "Lasers, meet the deep",
  ],
  rock: [
    "Guitars plugged in",
    "Amps glowing",
    "Heads banging underwater",
    "Riff incoming",
  ],
  rnb: [
    "Smooth and velvet",
    "Silk-current mode",
    "Slow-burn frequencies",
    "Heartbeat tempo",
  ],
  sad: [
    "Slowing the current",
    "Letting the feeling settle",
    "Quiet water, big thoughts",
    "Soft and heavy",
  ],
  default: [
    "Listening to the room",
    "Reading the vibe",
    "Waiting for the next wave",
    "The abyss is tuning in",
  ],
};

export function pickMessage(vibe) {
  const pool = DJ_MESSAGES[vibe] || DJ_MESSAGES.default;
  return pool[Math.floor(Math.random() * pool.length)];
}
