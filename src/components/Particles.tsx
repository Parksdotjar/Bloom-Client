import { memo, useMemo, type CSSProperties } from 'react';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
  driftX: number;
  driftY: number;
  scalePeak: number;
}

function createParticle(id: number): Particle {
  return {
    id,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 180 + 60,
    duration: Math.random() * 30 + 18,
    delay: Math.random() * 5,
    opacity: Math.random() * 0.18 + 0.06,
    driftX: Math.random() * 15 - 7,
    driftY: Math.random() * 22 - 11,
    scalePeak: 1 + Math.random() * 0.14
  };
}

export const Particles = memo(function Particles({ animated = true }: { animated?: boolean }) {
  const particles = useMemo(() => Array.from({ length: 25 }, (_, index) => createParticle(index)), []);

  return (
    <div className="particles-layer absolute inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className={`particle-orb ${animated ? '' : 'particle-orb-static'}`.trim()}
          style={
            {
              '--particle-size': `${particle.size}px`,
              '--particle-left': `${particle.x}%`,
              '--particle-top': `${particle.y}%`,
              '--particle-opacity': particle.opacity,
              '--particle-duration': `${particle.duration}s`,
              '--particle-delay': `${particle.delay}s`,
              '--particle-drift-x': `${particle.driftX}vw`,
              '--particle-drift-y': `${particle.driftY}vh`,
              '--particle-scale-peak': particle.scalePeak
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
});
