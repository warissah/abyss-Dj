import { goToLanding, goToUserEnd } from "../lib/router.js";

const FEATURES = [
  "Personal profile shell for your identity and avatar.",
  "Saved liked tracks synced from room sessions.",
  "Recent rooms timeline so you can rejoin quickly.",
  "Preference toggles for vibe defaults and audio behavior.",
];

export default function UserEndPage() {
  return (
    <div className="ocean">
      <div className="userEnd">
        <div className="userEndCard">
          <div className="landingAvatar" aria-hidden="true">
            👤
          </div>
          <h1 className="landingTitle">User End Page</h1>
          <p className="landingSubtitle">
            This dedicated user area is now wired into the app structure.
          </p>

          <div className="userEndSection">
            <h2 className="userEndHeading">What is ready now</h2>
            <ul className="userEndList">
              <li>Route at <code>/user-end</code></li>
              <li>Integrated with app-level navigation</li>
              <li>Shared ocean theme and UI language</li>
            </ul>
          </div>

          <div className="userEndSection">
            <h2 className="userEndHeading">Suggested next blocks</h2>
            <ul className="userEndList">
              {FEATURES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="landingActions">
            <button className="primaryBtn" onClick={goToLanding}>
              Back to landing
            </button>
            <button className="secondaryBtn" onClick={goToUserEnd}>
              Refresh this page route
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
