import { useEffect, useState } from "react";
import LandingPage from "./pages/LandingPage.jsx";
import RoomPage from "./pages/RoomPage.jsx";
import UserEndPage from "./pages/UserEndPage.jsx";
import { getNavigationEventName, readRouteFromUrl } from "./lib/router.js";
import "./styles/ocean.css";

export default function App() {
  const [route, setRoute] = useState(readRouteFromUrl);

  useEffect(() => {
    const onRouteChange = () => setRoute(readRouteFromUrl());
    const navigationEvent = getNavigationEventName();

    window.addEventListener("popstate", onRouteChange);
    window.addEventListener(navigationEvent, onRouteChange);
    return () => {
      window.removeEventListener("popstate", onRouteChange);
      window.removeEventListener(navigationEvent, onRouteChange);
    };
  }, []);

  if (route.name === "room") return <RoomPage roomCode={route.roomCode} />;
  if (route.name === "user-end") return <UserEndPage />;
  return <LandingPage />;
}
