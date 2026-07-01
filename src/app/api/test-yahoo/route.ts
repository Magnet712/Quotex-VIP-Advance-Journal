import { NextResponse } from 'next/server';
import https from 'https';

function fetchYahooPrice(symbol: string): Promise<number | string | null> {
  return new Promise((resolve) => {
    const options = {
      hostname: 'query1.finance.yahoo.com',
      path: `/v8/finance/chart/${symbol}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.chart && json.chart.result && json.chart.result[0]) {
            const meta = json.chart.result[0].meta;
            resolve(meta.regularMarketPrice);
          } else {
            resolve(`Error structure: ${data.substring(0, 200)}`);
          }
        } catch (e: any) {
          resolve(`Parse Error: ${e.message}. Raw: ${data.substring(0, 200)}`);
        }
      });
    }).on('error', (err) => resolve(`HTTP Error: ${err.message}`));
  });
}

export async function GET() {
  const eurUsd = await fetchYahooPrice('EURUSD=X');
  const usdJpy = await fetchYahooPrice('USDJPY=X');
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    eurUsd,
    usdJpy
  });
}
