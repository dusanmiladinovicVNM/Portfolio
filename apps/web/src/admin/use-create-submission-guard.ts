import { useCallback, useEffect, useRef } from 'react';

export interface CreateSubmissionGuard {
  readonly tryStart: () => boolean;
  readonly finish: () => void;
  readonly isMounted: () => boolean;
  readonly isInFlight: () => boolean;
}

export function useCreateSubmissionGuard(): CreateSubmissionGuard {
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const tryStart = useCallback(() => {
    if (inFlightRef.current) return false;
    inFlightRef.current = true;
    return true;
  }, []);

  const finish = useCallback(() => {
    inFlightRef.current = false;
  }, []);

  const isMounted = useCallback(() => mountedRef.current, []);
  const isInFlight = useCallback(() => inFlightRef.current, []);

  return { tryStart, finish, isMounted, isInFlight };
}
