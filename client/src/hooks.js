// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/** Fetches a dashboard resource. Optional pollMs keeps it live while shouldPoll(data) is true. */
export function useResource(path, { pollMs, shouldPoll } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const shouldPollRef = useRef(shouldPoll);
  shouldPollRef.current = shouldPoll;

  const load = useCallback(async () => {
    try {
      const next = await api.get(path);
      setData(next);
      setError(null);
      return next;
    } catch (err) {
      setError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(true);
    let timer;
    let cancelled = false;
    const tick = async () => {
      const next = await load();
      if (!cancelled && pollMs && (!shouldPollRef.current || shouldPollRef.current(next))) timer = setTimeout(tick, pollMs);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load, pollMs]);

  return { data, error, loading, reload: load, setData };
}
