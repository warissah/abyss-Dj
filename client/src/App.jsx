import { useEffect, useState } from "react";
import Landing from "./components/Landing.jsx";
import Room from "./components/Room.jsx";
import "./styles/ocean.css";

// Thin URL-based router. ?room=CODE renders a Room, everything else lands.
// No react-router dep: Tier 1 only needs two "pages".
function readRoomFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("room");
  return raw ? raw.trim().toUpperCase() : null;
}

export default function App() {
  const [roomCode, setRoomCode] = useState(readRoomFromUrl);

  useEffect(() => {
    const onPop = () => setRoomCode(readRoomFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (!roomCode) return <Landing />;
  return <Room key={roomCode} code={roomCode} />;
}
