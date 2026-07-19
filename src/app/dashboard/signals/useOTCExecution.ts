'use client';

import { useState, useEffect, useCallback } from 'react';
import { otcEngine } from '@/lib/otc/OTCExecutionEngine';
import {
  OTCExecutionRecord,
  OTCExecutionSnapshot,
  OTC_RUNNING_STATUSES,
  OTC_POPUP_VISIBLE_STATUSES,
  OTC_TERMINAL_STATUSES,
} from '@/lib/otc/otc-execution-types';


export interface OTCExecutionState {
  activeScans: OTCExecutionRecord[];
  popupRecords: OTCExecutionRecord[];
  timelineRecords: OTCExecutionRecord[];
  runningCount: number;
  canScan: boolean;
}

export function useOTCExecution(): OTCExecutionState & {
  scan: (pairShort: string) => Promise<{ success: boolean; error?: string; direction?: 'CALL' | 'PUT' | 'WAIT' }>;
  dismiss: (id: string) => void;
} {
  const [state, setState] = useState<OTCExecutionState>(() => ({
    activeScans: otcEngine.getActiveScans(),
    popupRecords: otcEngine.getPopupRecords(),
    timelineRecords: otcEngine.getTimelineRecords(),
    runningCount: otcEngine.getRunningCount(),
    canScan: otcEngine.canScan(),
  }));

  useEffect(() => {
    otcEngine.start();

    const listener = (snapshot: OTCExecutionSnapshot) => {
      const records = snapshot.records;
      setState({
        activeScans: records.filter(r => OTC_RUNNING_STATUSES.has(r.status)),
        popupRecords: records.filter(r => OTC_POPUP_VISIBLE_STATUSES.has(r.status)),
        timelineRecords: records.filter(r => r.status !== 'REMOVE').sort((a, b) => b.scanStartedAt - a.scanStartedAt),
        runningCount: records.filter(r => OTC_RUNNING_STATUSES.has(r.status)).length,
        canScan: records.filter(r => OTC_RUNNING_STATUSES.has(r.status)).length < 3,
      });
    };

    const unsub = otcEngine.subscribe(listener);

    // Restore active OTC signals from database after refresh
    otcEngine.loadActiveSignals();
    // Restore terminal (WIN/LOSS/REFUND/FAILED) signals for permanent timeline
    otcEngine.loadTerminalSignals();

    return () => {
      unsub();
    };
  }, []);

  const scan = useCallback(async (pairShort: string) => {
    return otcEngine.scan(pairShort);
  }, []);

  const dismiss = useCallback((id: string) => {
    otcEngine.dismissScan(id);
  }, []);

  return { ...state, scan, dismiss };
}
