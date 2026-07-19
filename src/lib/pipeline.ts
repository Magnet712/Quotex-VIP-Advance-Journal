export type DataPipeline = 'ALL' | 'live_otc' | 'live_market';

export function sourceLabel(source?: string): string {
  switch (source) {
    case 'live_otc':    return 'LIVE OTC';
    case 'live_market': return 'TWELVE DATA';
    case 'simulation':  return 'SIMULATION';
    default:            return source ?? '';
  }
}
