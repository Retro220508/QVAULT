/**
 * @file QuantumGrid.tsx
 * @description Animated quantum-inspired SVG grid background component.
 * Used as the hero section background to reinforce the quantum computing theme.
 */

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  color: string;
}

/**
 * Canvas-based animated particle field simulating quantum superposition.
 * Particles drift and connect when within proximity, forming a lattice-like
 * structure evocative of quantum lattice cryptography.
 */
export default function QuantumGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Particle palette — cyan/violet/fuchsia matching Qvault theme
    const COLORS = [
      "rgba(34, 211, 238,",   // cyan-400
      "rgba(139, 92, 246,",   // violet-500
      "rgba(232, 121, 249,",  // fuchsia-400
    ];

    const PARTICLE_COUNT  = 60;
    const CONNECTION_DIST = 130;
    const MAX_SPEED       = 0.4;

    let animId: number;
    const particles: Particle[] = [];

    const resize = () => {
      canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    const initParticles = () => {
      particles.length = 0;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push({
          x:       Math.random() * w,
          y:       Math.random() * h,
          vx:      (Math.random() - 0.5) * MAX_SPEED,
          vy:      (Math.random() - 0.5) * MAX_SPEED,
          size:    Math.random() * 2 + 1,
          opacity: Math.random() * 0.5 + 0.2,
          color:   COLORS[Math.floor(Math.random() * COLORS.length)],
        });
      }
    };

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;

      ctx.clearRect(0, 0, w, h);

      // Update positions
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around edges
        if (p.x < 0)  p.x = w;
        if (p.x > w)  p.x = 0;
        if (p.y < 0)  p.y = h;
        if (p.y > h)  p.y = 0;
      }

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx   = particles[i].x - particles[j].x;
          const dy   = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < CONNECTION_DIST) {
            const alpha = (1 - dist / CONNECTION_DIST) * 0.15;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `${particles[i].color}${alpha})`;
            ctx.lineWidth   = 0.5;
            ctx.stroke();
          }
        }
      }

      // Draw particles
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${p.opacity})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    resize();
    initParticles();
    draw();

    const handleResize = () => {
      resize();
      initParticles();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.6 }}
    />
  );
}
