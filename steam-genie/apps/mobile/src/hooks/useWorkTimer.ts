import { useEffect, useState } from 'react';

function formatElapsed(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(totalMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Elapsed work time since check-in, updated every second. Returns null when not checked in. */
export function useWorkTimer(checkInAt: string | null | undefined): string | null {
  const [elapsed, setElapsed] = useState<string | null>(null);

  useEffect(() => {
    if (!checkInAt) {
      setElapsed(null);
      return;
    }

    const startMs = new Date(checkInAt).getTime();
    if (Number.isNaN(startMs)) {
      setElapsed(null);
      return;
    }

    const tick = () => setElapsed(formatElapsed(Date.now() - startMs));

    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [checkInAt]);

  return elapsed;
}
