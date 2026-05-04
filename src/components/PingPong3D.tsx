import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Pause, Play, RefreshCcw } from 'lucide-react';
import * as THREE from 'three';

type Difficulty = 'rookie' | 'steady' | 'sharp' | 'champion';
type MatchStatus = 'idle' | 'running' | 'paused';

type DifficultyDef = {
  label: string;
  speed: number;
  tracking: number;
  error: number;
  reach: number;
  curveRead: number;
};

type Runtime = {
  ball: THREE.Vector3;
  velocity: THREE.Vector3;
  player: THREE.Vector3;
  playerVelocity: THREE.Vector3;
  bot: THREE.Vector3;
  botVelocity: THREE.Vector3;
  target: THREE.Vector2;
  score: { player: number; bot: number };
  status: MatchStatus;
  difficulty: Difficulty;
  lastTs: number;
  serveToBot: boolean;
  lastHit: 'player' | 'bot';
  messageUntil: number;
  message: string;
};

const TABLE_W = 5.4;
const TABLE_L = 9.2;
const TABLE_H = 0;
const NET_Z = 0;
const NET_H = 0.62;
const BALL_R = 0.13;
const PADDLE_R = 0.52;
const PADDLE_Z_PLAYER = -4.25;
const PADDLE_Z_BOT = 4.25;
const GRAVITY = -7.4;

const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  rookie: { label: 'Rookie', speed: 3.25, tracking: 3.6, error: 0.92, reach: 0.72, curveRead: 0.3 },
  steady: { label: 'Steady', speed: 3.8, tracking: 5.0, error: 0.5, reach: 0.9, curveRead: 0.52 },
  sharp: { label: 'Sharp', speed: 4.35, tracking: 6.6, error: 0.22, reach: 1.04, curveRead: 0.74 },
  champion: { label: 'Champion', speed: 4.9, tracking: 8.5, error: 0.08, reach: 1.16, curveRead: 0.95 }
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function themeColor() {
  if (typeof window === 'undefined') return '#f97316';
  return getComputedStyle(document.documentElement).getPropertyValue('--g-accent').trim() || '#f97316';
}

function makeRuntime(difficulty: Difficulty): Runtime {
  return {
    ball: new THREE.Vector3(0, 0.68, -2.4),
    velocity: new THREE.Vector3(0.35, 2.15, DIFFICULTIES[difficulty].speed),
    player: new THREE.Vector3(0, 0.82, PADDLE_Z_PLAYER),
    playerVelocity: new THREE.Vector3(),
    bot: new THREE.Vector3(0, 0.86, PADDLE_Z_BOT),
    botVelocity: new THREE.Vector3(),
    target: new THREE.Vector2(0, 0.82),
    score: { player: 0, bot: 0 },
    status: 'idle',
    difficulty,
    lastTs: 0,
    serveToBot: true,
    lastHit: 'player',
    messageUntil: 0,
    message: 'Move your mouse over the table'
  };
}

function resetServe(rt: Runtime, playerScored: boolean) {
  rt.serveToBot = playerScored;
  rt.ball.set((Math.random() - 0.5) * 0.6, 0.72, playerScored ? -2.25 : 2.25);
  const dir = playerScored ? 1 : -1;
  rt.velocity.set((Math.random() - 0.5) * 0.7, 2.05, DIFFICULTIES[rt.difficulty].speed * dir);
  rt.lastHit = playerScored ? 'player' : 'bot';
  rt.message = playerScored ? 'Point' : 'Miss';
  rt.messageUntil = performance.now() + 900;
}

function predictX(rt: Runtime, def: DifficultyDef) {
  const dz = PADDLE_Z_BOT - rt.ball.z;
  const time = Math.max(0, dz / Math.max(0.1, rt.velocity.z));
  const drift = rt.velocity.x * time * def.curveRead;
  const miss = (Math.sin(performance.now() / 580) * 0.5 + Math.cos(performance.now() / 840) * 0.5) * def.error;
  return clamp(rt.ball.x + drift + miss, -TABLE_W / 2 + 0.5, TABLE_W / 2 - 0.5);
}

export function PingPong3D() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<Runtime>(makeRuntime('steady'));
  const [difficulty, setDifficulty] = useState<Difficulty>('steady');
  const [status, setStatus] = useState<MatchStatus>('idle');
  const [score, setScore] = useState({ player: 0, bot: 0 });

  const difficultyItems = useMemo(() => Object.entries(DIFFICULTIES) as Array<[Difficulty, DifficultyDef]>, []);

  const start = useCallback(() => {
    const rt = runtimeRef.current;
    rt.status = 'running';
    rt.message = '';
    rt.messageUntil = 0;
    setStatus('running');
  }, []);

  const restart = useCallback(() => {
    runtimeRef.current = makeRuntime(difficulty);
    runtimeRef.current.status = 'running';
    setScore({ player: 0, bot: 0 });
    setStatus('running');
  }, [difficulty]);

  const togglePause = useCallback(() => {
    const rt = runtimeRef.current;
    rt.status = rt.status === 'running' ? 'paused' : rt.status === 'paused' ? 'running' : rt.status;
    rt.lastTs = 0;
    setStatus(rt.status);
  }, []);

  useEffect(() => {
    runtimeRef.current.difficulty = difficulty;
  }, [difficulty]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#2b2b2b');
    scene.fog = new THREE.Fog('#2b2b2b', 8, 15);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    camera.position.set(0, 5.8, -8.4);
    camera.lookAt(0, 0.5, 0.7);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight('#ffffff', '#4b5563', 1.65);
    scene.add(ambient);
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(-3, 7, -5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);

    const accent = themeColor();
    const tableMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5, metalness: 0.04 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: '#f7f7f7', roughness: 0.38 });
    const netMat = new THREE.MeshStandardMaterial({ color: '#111111', transparent: true, opacity: 0.72, roughness: 0.7 });
    const paddleMat = new THREE.MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.45, metalness: 0.05 });
    const botPaddleMat = new THREE.MeshStandardMaterial({ color: '#f4f4f5', roughness: 0.48 });
    const ballMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.24, metalness: 0.02 });

    const table = new THREE.Mesh(new THREE.BoxGeometry(TABLE_W, 0.18, TABLE_L), tableMat);
    table.position.y = -0.1;
    table.receiveShadow = true;
    scene.add(table);

    const borderGeo = new THREE.BoxGeometry(1, 0.06, 1);
    const borders = [
      { s: [TABLE_W + 0.28, 0.06, 0.12], p: [0, 0.05, -TABLE_L / 2] },
      { s: [TABLE_W + 0.28, 0.06, 0.12], p: [0, 0.05, TABLE_L / 2] },
      { s: [0.12, 0.06, TABLE_L + 0.1], p: [-TABLE_W / 2, 0.05, 0] },
      { s: [0.12, 0.06, TABLE_L + 0.1], p: [TABLE_W / 2, 0.05, 0] },
      { s: [0.06, 0.055, TABLE_L - 0.2], p: [0, 0.07, 0] }
    ];
    for (const b of borders) {
      const mesh = new THREE.Mesh(borderGeo, edgeMat);
      mesh.scale.set(b.s[0], b.s[1], b.s[2]);
      mesh.position.set(b.p[0], b.p[1], b.p[2]);
      scene.add(mesh);
    }

    const netParts: THREE.Mesh[] = [];
    const addNetPart = (width: number, height: number, depth: number, x: number, y: number, z: number) => {
      const part = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), netMat);
      part.position.set(x, y, z);
      part.castShadow = true;
      scene.add(part);
      netParts.push(part);
    };
    addNetPart(TABLE_W + 0.32, 0.035, 0.045, 0, NET_H, NET_Z);
    addNetPart(TABLE_W + 0.32, 0.035, 0.045, 0, 0.12, NET_Z);
    for (let i = 0; i <= 10; i += 1) {
      const x = -TABLE_W / 2 + (TABLE_W / 10) * i;
      addNetPart(0.025, NET_H - 0.1, 0.035, x, NET_H / 2 + 0.05, NET_Z);
    }
    for (let i = 1; i <= 3; i += 1) {
      addNetPart(TABLE_W + 0.18, 0.018, 0.03, 0, 0.16 + i * 0.12, NET_Z);
    }

    const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 16), ballMat);
    ball.castShadow = true;
    scene.add(ball);

    const paddleGeo = new THREE.CylinderGeometry(PADDLE_R, PADDLE_R, 0.1, 48);
    const playerPaddle = new THREE.Mesh(paddleGeo, paddleMat);
    playerPaddle.rotation.x = Math.PI / 2;
    playerPaddle.castShadow = true;
    scene.add(playerPaddle);

    const botPaddle = new THREE.Mesh(paddleGeo, botPaddleMat);
    botPaddle.rotation.x = Math.PI / 2;
    botPaddle.castShadow = true;
    scene.add(botPaddle);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.ShadowMaterial({ opacity: 0.2 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.24;
    floor.receiveShadow = true;
    scene.add(floor);

    const pointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = clamp((0.5 - (event.clientX - rect.left) / rect.width) * TABLE_W, -TABLE_W / 2 + 0.45, TABLE_W / 2 - 0.45);
      const y = clamp((1 - (event.clientY - rect.top) / rect.height) * 1.7 + 0.25, 0.36, 1.95);
      runtimeRef.current.target.set(x, y);
    };
    renderer.domElement.addEventListener('pointermove', pointer);

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(360, Math.floor(Math.min(680, w * 0.62)));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let frame = 0;
    const loop = (ts: number) => {
      const rt = runtimeRef.current;
      const dt = rt.lastTs > 0 ? Math.min(0.033, (ts - rt.lastTs) / 1000) : 0.016;
      rt.lastTs = ts;

      tableMat.color.set(themeColor());

      if (rt.status === 'running') {
        const previousBall = rt.ball.clone();
        const previousPlayer = rt.player.clone();
        rt.player.x += (rt.target.x - rt.player.x) * Math.min(1, dt * 16);
        rt.player.y += (rt.target.y - rt.player.y) * Math.min(1, dt * 16);
        rt.player.z = PADDLE_Z_PLAYER;
        rt.playerVelocity.copy(rt.player).sub(previousPlayer).divideScalar(Math.max(dt, 0.001));

        const def = DIFFICULTIES[rt.difficulty];
        const previousBot = rt.bot.clone();
        const botTargetX = rt.velocity.z > 0 ? predictX(rt, def) : rt.ball.x * 0.18;
        const botTargetY = clamp(rt.ball.y + rt.velocity.y * 0.12, 0.52, 1.55);
        rt.bot.x += (botTargetX - rt.bot.x) * Math.min(1, dt * def.tracking);
        rt.bot.y += (botTargetY - rt.bot.y) * Math.min(1, dt * def.tracking * 0.7);
        rt.bot.z = PADDLE_Z_BOT;
        rt.botVelocity.copy(rt.bot).sub(previousBot).divideScalar(Math.max(dt, 0.001));

        rt.velocity.y += GRAVITY * dt;
        rt.ball.addScaledVector(rt.velocity, dt);
        rt.velocity.x *= 0.997;

        const crossedNet = (previousBall.z < NET_Z && rt.ball.z >= NET_Z) || (previousBall.z > NET_Z && rt.ball.z <= NET_Z);
        if (crossedNet && Math.abs(rt.ball.x) <= TABLE_W / 2 + BALL_R && rt.ball.y - BALL_R <= NET_H) {
          rt.ball.z = previousBall.z < NET_Z ? NET_Z - BALL_R - 0.02 : NET_Z + BALL_R + 0.02;
          rt.velocity.z *= -0.38;
          rt.velocity.y = Math.min(rt.velocity.y, 0.15);
          rt.velocity.x *= 0.65;
        }

        if (rt.ball.y - BALL_R <= TABLE_H && Math.abs(rt.ball.x) < TABLE_W / 2 && Math.abs(rt.ball.z) < TABLE_L / 2) {
          rt.ball.y = TABLE_H + BALL_R;
          rt.velocity.y = Math.abs(rt.velocity.y) * 0.86;
          rt.velocity.x *= 0.94;
          rt.velocity.z *= 0.985;
        }

        const hitPlayer = rt.velocity.z < 0 && Math.abs(rt.ball.z - PADDLE_Z_PLAYER) < 0.28;
        const hitBot = rt.velocity.z > 0 && Math.abs(rt.ball.z - PADDLE_Z_BOT) < 0.28;
        const collide = (paddle: THREE.Vector3, paddleVelocity: THREE.Vector3, toward: 1 | -1, bot = false) => {
          const dx = rt.ball.x - paddle.x;
          const dy = rt.ball.y - paddle.y;
          const dist = Math.hypot(dx, dy * 0.82);
          const reach = PADDLE_R * (bot ? DIFFICULTIES[rt.difficulty].reach : 1);
          if (dist > reach + BALL_R) return false;
          rt.ball.z = paddle.z + toward * 0.31;
          rt.velocity.z = Math.abs(rt.velocity.z) * toward + toward * 0.34;
          rt.velocity.x += dx * 2.15 + paddleVelocity.x * 0.16;
          const liftNeeded = 2.75 + Math.min(0.7, Math.abs(rt.velocity.z) * 0.08);
          rt.velocity.y = clamp(Math.max(liftNeeded, Math.abs(rt.velocity.y) * 0.34 + 1.85 - paddleVelocity.y * 0.18), 1.8, 5.2);
          if (bot) {
            rt.lastHit = 'bot';
            rt.velocity.x += (Math.random() - 0.5) * DIFFICULTIES[rt.difficulty].error;
            rt.velocity.y += 0.2;
          } else {
            rt.lastHit = 'player';
          }
          return true;
        };

        if (hitPlayer) collide(rt.player, rt.playerVelocity, 1);
        if (hitBot) collide(rt.bot, rt.botVelocity, -1, true);

        if (Math.abs(rt.ball.x) > TABLE_W / 2 + 0.35) {
          const playerPoint = rt.lastHit === 'bot';
          if (playerPoint) rt.score.player += 1;
          else rt.score.bot += 1;
          setScore({ ...rt.score });
          resetServe(rt, playerPoint);
        } else if (rt.ball.z < -TABLE_L / 2 - 0.6 || rt.ball.y < -1.2) {
          rt.score.bot += 1;
          setScore({ ...rt.score });
          resetServe(rt, false);
        } else if (rt.ball.z > TABLE_L / 2 + 0.6) {
          rt.score.player += 1;
          setScore({ ...rt.score });
          resetServe(rt, true);
        }
      }

      ball.position.copy(rt.ball);
      playerPaddle.position.copy(rt.player);
      playerPaddle.rotation.z = clamp(-rt.playerVelocity.x * 0.035, -0.45, 0.45);
      playerPaddle.rotation.y = clamp(rt.playerVelocity.y * 0.035, -0.45, 0.45);
      botPaddle.position.copy(rt.bot);
      botPaddle.rotation.z = clamp(-rt.botVelocity.x * 0.025, -0.3, 0.3);

      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointermove', pointer);
      host.removeChild(renderer.domElement);
      renderer.dispose();
      table.geometry.dispose();
      tableMat.dispose();
      edgeMat.dispose();
      netMat.dispose();
      for (const part of netParts) part.geometry.dispose();
      paddleMat.dispose();
      botPaddleMat.dispose();
      ballMat.dispose();
      borderGeo.dispose();
      paddleGeo.dispose();
      floor.geometry.dispose();
    };
  }, []);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="g-panel overflow-hidden p-3">
        <div ref={hostRef} className="min-h-[360px] w-full rounded-xl border border-white/10 bg-[#2b2b2b]" />
      </section>

      <aside className="space-y-3">
        <section className="g-panel p-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="You" value={score.player} />
            <Stat label="Bot" value={score.bot} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={start} className="g-btn-accent h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-2"><Play size={13} />Start</button>
            <button onClick={togglePause} disabled={status === 'idle'} className="g-btn h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-2 disabled:opacity-45"><Pause size={13} />{status === 'paused' ? 'Resume' : 'Pause'}</button>
            <button onClick={restart} className="g-btn h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-2"><RefreshCcw size={13} />Reset</button>
          </div>
          <p className="mt-3 text-xs font-bold text-white/55">{status === 'running' ? 'Running' : status === 'paused' ? 'Paused' : 'Ready'}</p>
        </section>

        <section className="g-panel p-4">
          <p className="text-sm font-extrabold text-white">Bot Difficulty</p>
          <div className="mt-3 grid gap-2">
            {difficultyItems.map(([id, def]) => (
              <button
                key={id}
                onClick={() => {
                  setDifficulty(id);
                  runtimeRef.current.difficulty = id;
                }}
                className={clsx('h-10 px-3 text-left text-xs font-extrabold uppercase tracking-[0.12em]', difficulty === id ? 'g-btn-accent' : 'g-btn')}
              >
                {def.label}
              </button>
            ))}
          </div>
        </section>

        <section className="g-panel p-4">
          <p className="text-sm font-extrabold text-white">Controls</p>
          <div className="mt-3 space-y-2 text-xs font-bold text-white/58">
            <p>Move the mouse over the table to control your paddle.</p>
            <p>Fast left or right movement adds side curve on contact.</p>
            <p>Fast upward movement cuts the ball down; fast downward movement lifts it.</p>
          </div>
        </section>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/45">{label}</p>
      <p className="mt-1 text-3xl font-extrabold text-white">{value}</p>
    </div>
  );
}
