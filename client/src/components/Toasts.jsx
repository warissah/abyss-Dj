import { useEffect } from "react";

// Controlled toast stack. Parent owns the list; we just auto-expire entries.
export default function Toasts({ toasts, onExpire }) {
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(() => onExpire(t.id), 3500)
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, onExpire]);

  return (
    <div className="toastStack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span className="toastAvatar">{t.avatar}</span>
          <span className="toastText">
            <strong>{t.name}</strong>{" "}
            {t.kind === "join" ? "joined" : "left"}
          </span>
        </div>
      ))}
    </div>
  );
}
