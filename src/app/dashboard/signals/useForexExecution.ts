'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  engine,
  ExecutionEngine,
} from '@/lib/forex-execution/ExecutionEngine';
import {
  ExecutionRecord,
  EngineSnapshot,
  RUNNING_STATUSES,
  POPUP_VISIBLE_STATUSES,
} from '@/lib/forex-execution/types';

export interface ForexExecutionState {
  activeScans: ExecutionRecord[];
  popupRecords: ExecutionRecord[];
  timelineRecords: ExecutionRecord[];
  runningCount: number;
  canScan: boolean;
}

export function useForexExecution(): ForexExecutionState & {
  scan: (pair: string) => Promise<{ success: boolean; error?: string; direction?: 'CALL' | 'PUT' | 'WAIT' }>;
  dismiss: (id: string) => void;
  reset: (forexPairs: string[]) => void;
} {
  const [state, setState] = useState<ForexExecutionState>(() => ({
    activeScans: engine.getActiveScans(),
    popupRecords: engine.getPopupRecords(),
    timelineRecords: engine.getTimelineRecords(),
    runningCount: engine.getRunningCount(),
    canScan: engine.canScan(),
  }));

  const recoveredRef = useRef(false);

  useEffect(() => {
    engine.start();

    const listener = (snapshot: EngineSnapshot) => {
      const records = snapshot.records;
      setState({
        activeScans: records.filter(r => RUNNING_STATUSES.has(r.status)),
        popupRecords: records.filter(r => POPUP_VISIBLE_STATUSES.has(r.status)),
        timelineRecords: records.filter(r => r.status !== 'REMOVE').sort((a, b) => b.scanStartedAt - a.scanStartedAt),
        runningCount: records.filter(r => RUNNING_STATUSES.has(r.status)).length,
        canScan: records.filter(r => RUNNING_STATUSES.has(r.status)).length < 3,
      });
    };

    const unsub = engine.subscribe(listener);

    if (!recoveredRef.current) {
      recoveredRef.current = true;
      engine.recover();
    }

    return () => {
      unsub();
    };
  }, []);

  const scan = useCallback(async (pair: string) => {
    return engine.scan(pair);
  }, []);

  const dismiss = useCallback((id: string) => {
    engine.dismissScan(id);
  }, []);

  const reset = useCallback((forexPairs: string[]) => {
    engine.reset(forexPairs);
  }, []);

  return { ...state, scan, dismiss, reset };
}
