import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Particle {
    id: number;
    x: number;
    y: number;
    size: number;
    duration: number;
    delay: number;
    opacity: number;
}

export function Particles() {
    const [particles, setParticles] = useState<Particle[]>([]);

    useEffect(() => {
        const generated = Array.from({ length: 25 }).map((_, i) => ({
            id: i,
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: Math.random() * 180 + 60,
            duration: Math.random() * 30 + 18,
            delay: Math.random() * 5,
            opacity: Math.random() * 0.18 + 0.06
        }));
        setParticles(generated);
    }, []);

    return (
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
            {particles.map((p) => (
                <motion.div
                    key={p.id}
                    className="absolute rounded-full blur-3xl"
                    style={{
                        width: p.size,
                        height: p.size,
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        background: 'radial-gradient(circle, color-mix(in srgb, var(--g-accent) 70%, #ffffff 30%) 0%, transparent 72%)',
                        opacity: p.opacity,
                    }}
                    animate={{
                        y: ['0vh', '-12vh', '10vh', '0vh'],
                        x: ['0vw', '8vw', '-7vw', '0vw'],
                        opacity: [p.opacity * 0.5, p.opacity, p.opacity * 0.45],
                        scale: [0.9, 1.08, 0.95, 0.9],
                    }}
                    transition={{
                        duration: p.duration,
                        repeat: Infinity,
                        ease: 'linear',
                        delay: p.delay,
                    }}
                />
            ))}
        </div>
    );
}
