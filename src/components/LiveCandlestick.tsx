'use client';

import React, { useEffect, useRef } from 'react';

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  time: number;
}

export default function LiveCandlestick() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let width = (canvas.width = canvas.clientWidth);
    let height = (canvas.height = canvas.clientHeight);

    // Initial dummy data
    const candles: Candle[] = [];
    let startPrice = 1.0850;
    const now = Date.now();

    for (let i = 0; i < 20; i++) {
      const change = (Math.random() - 0.5) * 0.0010;
      const open = startPrice;
      const close = startPrice + change;
      const high = Math.max(open, close) + Math.random() * 0.0005;
      const low = Math.min(open, close) - Math.random() * 0.0005;
      candles.push({ open, high, low, close, time: now - (20 - i) * 5000 });
      startPrice = close;
    }

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.clientWidth;
      height = canvas.height = canvas.clientHeight;
    };
    window.addEventListener('resize', handleResize);

    // Dynamic price ticking
    let lastTickTime = Date.now();
    let currentPrice = candles[candles.length - 1].close;

    const tick = () => {
      const time = Date.now();
      const lastCandle = candles[candles.length - 1];

      // If 5 seconds have passed, start a new candle
      if (time - lastTickTime > 5000) {
        candles.shift();
        const open = lastCandle.close;
        const close = open;
        candles.push({ open, high: open, low: open, close, time });
        lastTickTime = time;
      } else {
        // Ticking the current candle
        const currentCandle = candles[candles.length - 1];
        const tickChange = (Math.random() - 0.5) * 0.00015;
        currentPrice += tickChange;
        currentCandle.close = currentPrice;
        currentCandle.high = Math.max(currentCandle.high, currentPrice);
        currentCandle.low = Math.min(currentCandle.low, currentPrice);
      }
    };

    const draw = () => {
      ctx.fillStyle = '#030812';
      ctx.fillRect(0, 0, width, height);

      // Draw Grid Lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Min & Max prices to scale
      let minPrice = Math.min(...candles.map(c => c.low));
      let maxPrice = Math.max(...candles.map(c => c.high));
      const spread = maxPrice - minPrice;
      const padding = spread * 0.1;
      minPrice -= padding;
      maxPrice += padding;

      const scaleY = (price: number) => {
        return height - ((price - minPrice) / (maxPrice - minPrice)) * height;
      };

      const candleWidth = width / candles.length;

      // Draw Candles
      candles.forEach((candle, index) => {
        const isGreen = candle.close >= candle.open;
        const x = index * candleWidth + candleWidth * 0.2;
        const w = candleWidth * 0.6;
        const yOpen = scaleY(candle.open);
        const yClose = scaleY(candle.close);
        const yHigh = scaleY(candle.high);
        const yLow = scaleY(candle.low);

        const color = isGreen ? '#00E676' : '#FF5252';
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;

        // Wick
        ctx.beginPath();
        ctx.moveTo(x + w / 2, yHigh);
        ctx.lineTo(x + w / 2, yLow);
        ctx.stroke();

        // Body
        const bodyHeight = Math.abs(yClose - yOpen) || 1;
        const bodyY = Math.min(yOpen, yClose);
        ctx.fillRect(x, bodyY, w, bodyHeight);

        // Faint glow on candles
        ctx.shadowColor = color;
        ctx.shadowBlur = 4;
        ctx.strokeRect(x, bodyY, w, bodyHeight);
        ctx.shadowBlur = 0;
      });

      // Draw Price Line for Current Price
      const currentY = scaleY(currentPrice);
      ctx.strokeStyle = 'rgba(0, 230, 118, 0.4)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, currentY);
      ctx.lineTo(width, currentY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw Price tag
      ctx.fillStyle = '#00E676';
      ctx.font = '10px monospace';
      ctx.fillText(currentPrice.toFixed(4), width - 50, currentY - 4);
    };

    const loop = () => {
      tick();
      draw();
      animationId = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div className="w-full h-full bg-[#030812] border border-glass-border rounded-lg overflow-hidden flex flex-col">
      <div className="flex justify-between items-center bg-[#070e1b] px-3 py-2 border-b border-glass-border">
        <span className="text-xs font-mono font-bold text-slate-300">EUR/USD Live Terminal</span>
        <span className="h-2 w-2 rounded-full bg-neon-green animate-ping" />
      </div>
      <div className="flex-1 min-h-[180px]">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>
    </div>
  );
}
