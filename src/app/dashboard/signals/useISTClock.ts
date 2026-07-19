'use client';

import { useState, useEffect } from 'react';

export function useISTClock(timeOffset: number) {
  const [time, setTime] = useState('');
  useEffect(() => {
    const update = () => {
      const now = new Date(Date.now() + timeOffset);
      const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
      const h = ist.getUTCHours().toString().padStart(2, '0');
      const m = ist.getUTCMinutes().toString().padStart(2, '0');
      const s = ist.getUTCSeconds().toString().padStart(2, '0');
      setTime(`${h}:${m}:${s} IST`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [timeOffset]);
  return time;
}
