'use client';

import React, { useEffect, useRef } from 'react';

export default function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = canvas.clientHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = canvas.clientHeight;
    };

    window.addEventListener('resize', handleResize);

    // Wave parameters
    const waves = [
      {
        y: height * 0.5,
        length: 0.002,
        amplitude: 60,
        speed: 0.015,
        color: 'rgba(0, 230, 118, 0.08)',
        glow: 'rgba(0, 230, 118, 0.2)',
      },
      {
        y: height * 0.55,
        length: 0.0015,
        amplitude: 90,
        speed: 0.01,
        color: 'rgba(0, 230, 118, 0.05)',
        glow: 'rgba(0, 230, 118, 0.1)',
      },
      {
        y: height * 0.45,
        length: 0.003,
        amplitude: 40,
        speed: 0.02,
        color: 'rgba(255, 217, 0, 0.04)',
        glow: 'rgba(255, 217, 0, 0.15)',
      },
    ];

    let increment = 0;

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      
      // Clear canvas with subtle trail
      ctx.fillStyle = 'rgba(2, 6, 23, 0.06)';
      ctx.fillRect(0, 0, width, height);

      waves.forEach((wave) => {
        ctx.beginPath();
        ctx.moveTo(0, height * 0.5);

        for (let i = 0; i < width; i++) {
          const yOffset = Math.sin(i * wave.length + increment) * wave.amplitude * Math.sin(increment * 0.2);
          ctx.lineTo(i, wave.y + yOffset);
        }

        ctx.strokeStyle = wave.color;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = wave.glow;
        ctx.shadowBlur = 8;
        ctx.stroke();
      });

      // Draw faint terminal trading grid lines
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.005)';
      ctx.lineWidth = 1;

      // Vertical lines
      for (let x = 0; x < width; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Horizontal lines
      for (let y = 0; y < height; y += 60) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      increment += 0.01;
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 w-full h-[600px] pointer-events-none opacity-60 z-0"
    />
  );
}
