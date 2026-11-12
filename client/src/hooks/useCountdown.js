import { useEffect, useState } from "react";

export function useCountdown(endsAt, serverNow) {
  const [now, setNow] = useState(() => serverNow || Date.now());

  useEffect(() => {
    if (serverNow) setNow(serverNow);
  }, [serverNow]);

  useEffect(() => {
    const id = setInterval(() => setNow((current) => current + 200), 200);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}
