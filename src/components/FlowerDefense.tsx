import { useEffect, useMemo, useRef, useState, type Dispatch, type PointerEvent, type SetStateAction } from 'react';
import { clsx } from 'clsx';
import { FastForward, Play, RefreshCcw } from 'lucide-react';

type Point = { x: number; y: number };
type Enemy = { id: number; hp: number; maxHp: number; speed: number; reward: number; progress: number; slow: number; poison: number; kind: string };
type Projectile = { id: number; x: number; y: number; targetId: number; speed: number; damage: number; color: string; splash: number; slow: number; poison: number; cashMult: number };
type Tower = { id: number; type: string; x: number; y: number; level: number; cooldown: number };
type SaveState = ReturnType<typeof defaultState>;
type RuntimeState = { enemies: Enemy[]; projectiles: Projectile[]; nextId: number; spawnLeft: number; spawnTimer: number; running: boolean; over: boolean };
type GameSpeed = 1 | 2 | 3 | 5 | 10;
type TowerDef = {
  id: string;
  name: string;
  cost: number;
  range: number;
  damage: number;
  fireRate: number;
  color: string;
  role: string;
  splash?: number;
  slow?: number;
  poison?: number;
  pierce?: number;
};

const W = 960;
const H = 560;
const FLOWER_DEFENSE_SAVE_KEY = 'bloom_games_flower_defense_v1';
const PATH: Point[] = [
  { x: 24, y: 292 },
  { x: 150, y: 292 },
  { x: 150, y: 116 },
  { x: 332, y: 116 },
  { x: 332, y: 418 },
  { x: 548, y: 418 },
  { x: 548, y: 176 },
  { x: 736, y: 176 },
  { x: 736, y: 342 },
  { x: 936, y: 342 }
];

const TOWER_DEFS: TowerDef[] = [
  { id: 'daisy', name: 'Daisy Dart', cost: 75, range: 96, damage: 13, fireRate: 0.7, color: '#fef08a', role: 'Fast seed shots' },
  { id: 'rose', name: 'Rose Thorn', cost: 115, range: 118, damage: 24, fireRate: 0.95, color: '#fb7185', role: 'Reliable pierce', pierce: 2 },
  { id: 'sunflower', name: 'Sunflower Beam', cost: 145, range: 132, damage: 18, fireRate: 0.45, color: '#facc15', role: 'Rapid beam' },
  { id: 'lavender', name: 'Lavender Mist', cost: 160, range: 110, damage: 8, fireRate: 1.1, color: '#c084fc', role: 'Slows blooms', slow: 1.6 },
  { id: 'tulip', name: 'Tulip Popper', cost: 190, range: 104, damage: 35, fireRate: 1.25, color: '#f97316', role: 'Splash petals', splash: 42 },
  { id: 'orchid', name: 'Orchid Focus', cost: 230, range: 158, damage: 46, fireRate: 1.45, color: '#e879f9', role: 'Long range' },
  { id: 'cactus', name: 'Cactus Spine', cost: 260, range: 122, damage: 58, fireRate: 1.2, color: '#84cc16', role: 'Heavy thorns', pierce: 3 },
  { id: 'lily', name: 'Lily Splash', cost: 285, range: 116, damage: 34, fireRate: 1.05, color: '#7dd3fc', role: 'Wide splash', splash: 58 },
  { id: 'dandelion', name: 'Dandelion Gust', cost: 315, range: 148, damage: 22, fireRate: 0.38, color: '#fde68a', role: 'Very fast' },
  { id: 'poppy', name: 'Poppy Burst', cost: 350, range: 106, damage: 78, fireRate: 1.7, color: '#ef4444', role: 'Burst damage', splash: 36 },
  { id: 'iris', name: 'Iris Prism', cost: 390, range: 150, damage: 62, fireRate: 0.95, color: '#818cf8', role: 'Balanced elite' },
  { id: 'peony', name: 'Peony Mortar', cost: 440, range: 180, damage: 95, fireRate: 2.0, color: '#f9a8d4', role: 'Huge splash', splash: 74 },
  { id: 'mint', name: 'Mint Freeze', cost: 480, range: 126, damage: 20, fireRate: 0.9, color: '#5eead4', role: 'Strong slow', slow: 2.8 },
  { id: 'snapdragon', name: 'Snapdragon Fire', cost: 540, range: 128, damage: 72, fireRate: 0.72, color: '#fb923c', role: 'Burn poison', poison: 4 },
  { id: 'lotus', name: 'Lotus Pulse', cost: 620, range: 138, damage: 55, fireRate: 0.62, color: '#67e8f9', role: 'Pulse splash', splash: 50 },
  { id: 'violet', name: 'Violet Hex', cost: 710, range: 168, damage: 88, fireRate: 1.0, color: '#a78bfa', role: 'Slow poison', slow: 1.2, poison: 3 },
  { id: 'marigold', name: 'Marigold Gold', cost: 820, range: 118, damage: 92, fireRate: 0.82, color: '#f59e0b', role: '3x+ cash kills' },
  { id: 'hibiscus', name: 'Hibiscus Cannon', cost: 980, range: 152, damage: 145, fireRate: 1.55, color: '#f472b6', role: 'Late-game cannon', splash: 62 },
  { id: 'wisteria', name: 'Wisteria Chain', cost: 1200, range: 176, damage: 118, fireRate: 0.9, color: '#d8b4fe', role: 'Chain pierce', pierce: 5 },
  { id: 'nightshade', name: 'Nightshade Nova', cost: 1550, range: 190, damage: 210, fireRate: 1.8, color: '#7c3aed', role: 'Endgame nova', splash: 86, poison: 6 }
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const PATH_LENGTHS = PATH.slice(1).map((point, index) => dist(PATH[index], point));
const TOTAL_PATH = PATH_LENGTHS.reduce((sum, length) => sum + length, 0);

function pathPoint(progress: number): Point {
  let remaining = progress * TOTAL_PATH;
  for (let i = 0; i < PATH_LENGTHS.length; i += 1) {
    const length = PATH_LENGTHS[i];
    if (remaining <= length) {
      const a = PATH[i];
      const b = PATH[i + 1];
      const t = length <= 0 ? 0 : remaining / length;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= length;
  }
  return PATH[PATH.length - 1];
}

function waveStats(wave: number) {
  const boss = wave % 10 === 0;
  const count = boss ? 8 + Math.floor(wave / 8) : 14 + Math.floor(wave * 1.18);
  const hp = Math.round((34 + wave * 12) * Math.pow(1.052, wave) * (boss ? 5.2 : 1));
  const speed = 0.032 + Math.min(0.055, wave * 0.00022) + (boss ? -0.01 : 0);
  const reward = boss ? 500 : Math.max(5, Math.floor(8 + wave * 0.65));
  return { count, hp, speed, reward, boss };
}

function defaultState() {
  return { cash: 475, lives: 40, wave: 0, bestWave: 0, towers: [] as Tower[] };
}

function readSave(): SaveState {
  try {
    const raw = localStorage.getItem(FLOWER_DEFENSE_SAVE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<ReturnType<typeof defaultState>>;
    return {
      cash: Number.isFinite(parsed.cash) ? Math.max(0, Number(parsed.cash)) : 475,
      lives: Number.isFinite(parsed.lives) ? Math.max(1, Number(parsed.lives)) : 40,
      wave: Number.isFinite(parsed.wave) ? Math.max(0, Math.floor(Number(parsed.wave))) : 0,
      bestWave: Number.isFinite(parsed.bestWave) ? Math.max(0, Math.floor(Number(parsed.bestWave))) : 0,
      towers: Array.isArray(parsed.towers) ? parsed.towers.filter((tower) => TOWER_DEFS.some((def) => def.id === tower.type)) as Tower[] : []
    };
  } catch {
    return defaultState();
  }
}

export function FlowerDefense() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<RuntimeState>({ enemies: [], projectiles: [], nextId: 1, spawnLeft: 0, spawnTimer: 0, running: false, over: false });
  const [save, setSave] = useState(() => readSave());
  const [selected, setSelected] = useState(TOWER_DEFS[0].id);
  const [selectedTower, setSelectedTower] = useState<number | null>(null);
  const [placementMode, setPlacementMode] = useState(false);
  const [speed, setSpeed] = useState<GameSpeed>(1);
  const [message, setMessage] = useState('Place flower towers beside the path.');
  const [placementPreview, setPlacementPreview] = useState<Point | null>(null);

  const selectedDef = TOWER_DEFS.find((tower) => tower.id === selected) || TOWER_DEFS[0];
  const selectedTowerData = save.towers.find((tower) => tower.id === selectedTower) || null;
  const selectedTowerDef = selectedTowerData ? TOWER_DEFS.find((tower) => tower.id === selectedTowerData.type) : null;
  const upgradeCost = selectedTowerData && selectedTowerDef ? Math.floor(selectedTowerDef.cost * Math.pow(1.85, selectedTowerData.level)) : 0;
  const sellValue = selectedTowerData && selectedTowerDef ? Math.floor(selectedTowerDef.cost * (0.55 + selectedTowerData.level * 0.22)) : 0;

  useEffect(() => {
    localStorage.setItem(FLOWER_DEFENSE_SAVE_KEY, JSON.stringify(save));
  }, [save]);

  const startWave = () => {
    const rt = runtimeRef.current;
    if (rt.running || save.lives <= 0 || save.wave >= 300) return;
    const nextWave = save.wave + 1;
    const stats = waveStats(nextWave);
    rt.spawnLeft = stats.count;
    rt.spawnTimer = 0;
    rt.running = true;
    setSave((current) => ({ ...current, wave: nextWave, bestWave: Math.max(current.bestWave, nextWave) }));
    setMessage(stats.boss ? `Wave ${nextWave}: giant overgrowth incoming.` : `Wave ${nextWave} started.`);
  };

  const resetRun = () => {
    runtimeRef.current = { enemies: [], projectiles: [], nextId: 1, spawnLeft: 0, spawnTimer: 0, running: false, over: false };
    setSave(defaultState());
    setSelectedTower(null);
    setMessage('Garden reset. Build a fresh defense.');
  };

  const placeOrSelect = (point: Point) => {
    const existing = save.towers.find((tower) => dist(tower, point) < 22);
    if (existing) {
      setSelectedTower(existing.id);
      setPlacementMode(false);
      return;
    }
    if (!placementMode) {
      setSelectedTower(null);
      setMessage('Select a flower from the shop to place one.');
      return;
    }
    if (PATH.some((pathNode, i) => i > 0 && distanceToSegment(point, PATH[i - 1], pathNode) < 38)) {
      setMessage('Keep towers off the enemy path.');
      return;
    }
    if (save.cash < selectedDef.cost) {
      setMessage(`Need $${selectedDef.cost} for ${selectedDef.name}.`);
      return;
    }
    setSave((current) => ({
      ...current,
      cash: current.cash - selectedDef.cost,
      towers: [...current.towers, { id: Date.now(), type: selectedDef.id, x: point.x, y: point.y, level: 1, cooldown: 0 }]
    }));
    setMessage(`${selectedDef.name} planted.`);
  };

  const upgradeSelected = () => {
    if (!selectedTowerData || !selectedTowerDef || save.cash < upgradeCost) return;
    setSave((current) => ({
      ...current,
      cash: current.cash - upgradeCost,
      towers: current.towers.map((tower) => tower.id === selectedTowerData.id ? { ...tower, level: tower.level + 1 } : tower)
    }));
  };

  const sellSelected = () => {
    if (!selectedTowerData) return;
    setSave((current) => ({
      ...current,
      cash: current.cash + sellValue,
      towers: current.towers.filter((tower) => tower.id !== selectedTowerData.id)
    }));
    setSelectedTower(null);
  };

  const canvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (W / rect.width), y: (event.clientY - rect.top) * (H / rect.height) };
  };

  const canPlaceAt = (point: Point | null) => {
    if (!point) return false;
    const onPath = PATH.some((pathNode, i) => i > 0 && distanceToSegment(point, PATH[i - 1], pathNode) < 38);
    const onTower = save.towers.some((tower) => dist(tower, point) < 44);
    return !onPath && !onTower && save.cash >= selectedDef.cost;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    let last = performance.now();

    const draw = (ts: number) => {
      const dt = Math.min(0.05, (ts - last) / 1000) * speed;
      last = ts;
      stepGame(dt, save.wave, save.towers, setSave, runtimeRef.current);
      render(ctx, save.towers, runtimeRef.current, selectedTower, selectedDef, placementMode ? placementPreview : null, placementMode && canPlaceAt(placementPreview));
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [save.cash, save.towers, save.wave, selectedDef, selectedTower, speed, placementMode, placementPreview]);

  const waveInfo = useMemo(() => waveStats(Math.min(300, save.wave + 1)), [save.wave]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="g-panel p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="grid grid-cols-4 gap-2 text-center">
            <Stat label="Cash" value={`$${Math.floor(save.cash)}`} />
            <Stat label="Lives" value={save.lives} />
            <Stat label="Wave" value={`${save.wave}/300`} />
            <Stat label="Next" value={`${waveInfo.count} buds`} />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={startWave} disabled={runtimeRef.current.running || save.lives <= 0 || save.wave >= 300} className="g-btn-accent h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-2 disabled:opacity-45"><Play size={13} />Start Wave</button>
            <button onClick={() => setSpeed((current) => current === 1 ? 2 : current === 2 ? 3 : current === 3 ? 5 : current === 5 ? 10 : 1)} className={clsx('h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-2', speed > 1 ? 'g-btn-accent' : 'g-btn')}><FastForward size={13} />{speed}x</button>
            <button onClick={resetRun} className="g-btn h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-2"><RefreshCcw size={13} />Reset</button>
          </div>
        </div>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerMove={(event) => setPlacementPreview(canvasPoint(event))}
          onPointerLeave={() => setPlacementPreview(null)}
          onPointerDown={(event) => {
            const point = canvasPoint(event);
            if (point) placeOrSelect(point);
          }}
          className={clsx('games-hd-canvas w-full rounded-2xl border border-white/10 bg-[#10140f] touch-none', placementMode ? 'cursor-crosshair' : 'cursor-default')}
          style={{ boxShadow: 'var(--g-panel-shadow)' }}
        />
        <p className="mt-2 text-xs font-bold text-white/60">{message}</p>
      </section>

      <aside className="space-y-3">
        <section className="g-panel p-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-extrabold text-white">Flower Towers</p>
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/45">20 types</span>
          </div>
          <div className="grid max-h-[420px] grid-cols-2 gap-2 overflow-auto pr-1">
            {TOWER_DEFS.map((tower) => (
              <button key={tower.id} onClick={() => { setSelected(tower.id); setSelectedTower(null); setPlacementMode(true); }} className={clsx('rounded-xl border p-2 text-left transition', selected === tower.id && placementMode ? 'border-[var(--g-accent)] bg-white/[0.08]' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]')}>
                <div className="mb-2 h-2 rounded-full" style={{ background: tower.color }} />
                <p className="text-xs font-extrabold text-white">{tower.name}</p>
                <p className="mt-1 text-[10px] text-white/50">${tower.cost} · {tower.role}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="g-panel p-3">
          <p className="text-sm font-extrabold text-white">{selectedTowerData && selectedTowerDef ? selectedTowerDef.name : placementMode ? selectedDef.name : 'Normal Cursor'}</p>
          <p className="mt-1 text-xs text-white/55">
            {selectedTowerData && selectedTowerDef ? `Level ${selectedTowerData.level} tower selected.` : placementMode ? `Place for $${selectedDef.cost}. Range ${selectedDef.range}.` : 'Click an existing tower to inspect or upgrade it.'}
          </p>
          {placementMode && !selectedTowerData && (
            <button
              onClick={() => { setPlacementMode(false); setPlacementPreview(null); setMessage('Normal cursor active. Click placed towers to upgrade.'); }}
              className="mt-3 w-full g-btn h-10 px-3 text-xs font-extrabold uppercase tracking-[0.12em]"
            >
              Cancel Placement
            </button>
          )}
          {selectedTowerData && selectedTowerDef && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={upgradeSelected} disabled={save.cash < upgradeCost} className="g-btn-accent h-10 px-3 text-xs font-extrabold uppercase tracking-[0.12em] disabled:opacity-45">Upgrade ${upgradeCost}</button>
              <button onClick={sellSelected} className="g-btn h-10 px-3 text-xs font-extrabold uppercase tracking-[0.12em]">Sell ${sellValue}</button>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/45">{label}</p><p className="mt-1 text-lg font-extrabold text-white">{value}</p></div>;
}

function distanceToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq, 0, 1);
  return dist(point, { x: start.x + dx * t, y: start.y + dy * t });
}

function towerStats(tower: Tower) {
  const def = TOWER_DEFS.find((item) => item.id === tower.type) || TOWER_DEFS[0];
  const levelScale = 1 + (tower.level - 1) * 0.34;
  return {
    ...def,
    range: def.range * (1 + (tower.level - 1) * 0.055),
    damage: def.damage * levelScale,
    fireRate: Math.max(0.16, def.fireRate * Math.pow(0.94, tower.level - 1)),
    splash: def.splash ? def.splash * (1 + tower.level * 0.035) : 0,
    slow: def.slow ? def.slow * (1 + tower.level * 0.04) : 0,
    poison: def.poison ? def.poison * (1 + tower.level * 0.12) : 0
  };
}

function stepGame(dt: number, wave: number, towers: Tower[], setSave: Dispatch<SetStateAction<SaveState>>, rt: RuntimeState) {
  if (rt.running && rt.spawnLeft > 0) {
    rt.spawnTimer -= dt;
    if (rt.spawnTimer <= 0) {
      rt.spawnTimer = 0.38;
      rt.spawnLeft -= 1;
      const stats = waveStats(Math.max(1, wave));
      rt.enemies.push({ id: rt.nextId++, hp: stats.hp, maxHp: stats.hp, speed: stats.speed * (0.86 + Math.random() * 0.28), reward: stats.reward, progress: 0, slow: 0, poison: 0, kind: stats.boss ? 'boss' : 'bud' });
    }
  }

  for (const enemy of rt.enemies) {
    if (enemy.poison > 0) {
      enemy.hp -= enemy.poison * dt * 12;
      enemy.poison = Math.max(0, enemy.poison - dt);
    }
    enemy.slow = Math.max(0, enemy.slow - dt);
    enemy.progress += enemy.speed * dt * (enemy.slow > 0 ? 0.48 : 1);
  }

  for (const tower of towers) {
    const stats = towerStats(tower);
    tower.cooldown = Math.max(0, tower.cooldown - dt);
    if (tower.cooldown > 0) continue;
    const target = rt.enemies.filter((enemy) => enemy.hp > 0 && enemy.progress < 1 && dist(pathPoint(enemy.progress), tower) <= stats.range).sort((a, b) => b.progress - a.progress)[0];
    if (!target) continue;
    rt.projectiles.push({ id: rt.nextId++, x: tower.x, y: tower.y, targetId: target.id, speed: 560, damage: stats.damage, color: stats.color, splash: stats.splash, slow: stats.slow, poison: stats.poison, cashMult: tower.type === 'marigold' ? tower.level + 2 : 1 });
    tower.cooldown = stats.fireRate;
  }

  for (const projectile of rt.projectiles) {
    const target = rt.enemies.find((enemy) => enemy.id === projectile.targetId);
    if (!target) {
      projectile.targetId = -1;
      continue;
    }
    const targetPoint = pathPoint(target.progress);
    const d = dist(projectile, targetPoint);
    const travel = projectile.speed * dt;
    if (d <= travel) {
      const wasAlive = target.hp > 0;
      target.hp -= projectile.damage;
      if (projectile.slow) target.slow = Math.max(target.slow, projectile.slow);
      if (projectile.poison) target.poison = Math.max(target.poison, projectile.poison);
      if (wasAlive && target.hp <= 0 && projectile.cashMult > 1) target.reward *= projectile.cashMult;
      if (projectile.splash > 0) {
        for (const enemy of rt.enemies) {
          if (enemy.id !== target.id && dist(pathPoint(enemy.progress), targetPoint) <= projectile.splash) enemy.hp -= projectile.damage * 0.55;
        }
      }
      projectile.targetId = -1;
    } else {
      projectile.x += ((targetPoint.x - projectile.x) / d) * travel;
      projectile.y += ((targetPoint.y - projectile.y) / d) * travel;
    }
  }

  let cashGain = 0;
  let leaks = 0;
  rt.enemies = rt.enemies.filter((enemy) => {
    if (enemy.hp <= 0) {
      cashGain += enemy.reward;
      return false;
    }
    if (enemy.progress >= 1) {
      leaks += enemy.kind === 'boss' ? 4 : 1;
      return false;
    }
    return true;
  });
  rt.projectiles = rt.projectiles.filter((projectile) => projectile.targetId !== -1);
  if (cashGain || leaks) {
    setSave((current) => ({ ...current, cash: current.cash + cashGain, lives: Math.max(0, current.lives - leaks) }));
  }
  if (rt.running && rt.spawnLeft <= 0 && rt.enemies.length === 0) {
    rt.running = false;
    setSave((current) => ({ ...current, cash: current.cash + 80 + current.wave * 6 }));
  }
}

function render(
  ctx: CanvasRenderingContext2D,
  towers: Tower[],
  rt: RuntimeState,
  selectedTower: number | null,
  selectedDef: TowerDef,
  placementPreview: Point | null,
  placementAllowed: boolean
) {
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#172414');
  bg.addColorStop(0.55, '#0f1a0d');
  bg.addColorStop(1, '#071008');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  drawGardenTexture(ctx);
  drawPath(ctx);

  for (const tower of towers) {
    const stats = towerStats(tower);
    drawTowerRange(ctx, tower, stats, selectedTower === tower.id);
  }

  if (placementPreview) {
    drawPlacementPreview(ctx, placementPreview, selectedDef, placementAllowed);
  }

  for (const tower of towers) {
    drawTower(ctx, tower, towerStats(tower), selectedTower === tower.id);
  }

  for (const enemy of rt.enemies) {
    drawEnemy(ctx, enemy);
  }

  for (const projectile of rt.projectiles) {
    ctx.shadowColor = projectile.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = projectile.color;
    ctx.beginPath();
    ctx.arc(projectile.x, projectile.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawGardenTexture(ctx: CanvasRenderingContext2D) {
  ctx.save();
  for (let y = 22; y < H; y += 46) {
    for (let x = 28; x < W; x += 54) {
      const offset = ((x * 17 + y * 31) % 18) - 9;
      ctx.fillStyle = 'rgba(132, 204, 22, 0.08)';
      ctx.beginPath();
      ctx.ellipse(x + offset, y, 3, 10, -0.55, 0, Math.PI * 2);
      ctx.ellipse(x + offset + 8, y + 3, 3, 9, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawPath(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  PATH.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
  ctx.strokeStyle = 'rgba(0,0,0,0.34)';
  ctx.lineWidth = 58;
  ctx.stroke();
  ctx.strokeStyle = '#5c4128';
  ctx.lineWidth = 48;
  ctx.stroke();
  const dirt = ctx.createLinearGradient(0, 80, W, H);
  dirt.addColorStop(0, '#c49a5f');
  dirt.addColorStop(0.55, '#a77742');
  dirt.addColorStop(1, '#d0ad76');
  ctx.strokeStyle = dirt;
  ctx.lineWidth = 32;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 18]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawTowerRange(ctx: CanvasRenderingContext2D, tower: Tower, stats: ReturnType<typeof towerStats>, active: boolean) {
  ctx.save();
  ctx.globalAlpha = active ? 0.18 : 0.05;
  ctx.fillStyle = stats.color;
  ctx.beginPath();
  ctx.arc(tower.x, tower.y, stats.range, 0, Math.PI * 2);
  ctx.fill();
  if (active) {
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = stats.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTower(ctx: CanvasRenderingContext2D, tower: Tower, stats: ReturnType<typeof towerStats>, active: boolean) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.42)';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#1a2417';
  ctx.beginPath();
  ctx.ellipse(tower.x, tower.y + 18, 24, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#2f6a36';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(tower.x, tower.y + 15);
  ctx.quadraticCurveTo(tower.x - 4, tower.y + 2, tower.x, tower.y - 8);
  ctx.stroke();
  ctx.fillStyle = '#2f8f45';
  ctx.beginPath();
  ctx.ellipse(tower.x - 9, tower.y + 6, 6, 12, -0.8, 0, Math.PI * 2);
  ctx.ellipse(tower.x + 10, tower.y + 8, 6, 11, 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = stats.color;
  for (let i = 0; i < 8; i += 1) {
    const a = (Math.PI * 2 * i) / 8;
    ctx.beginPath();
    ctx.ellipse(tower.x + Math.cos(a) * 14, tower.y - 12 + Math.sin(a) * 14, 8, 15, a, 0, Math.PI * 2);
    ctx.fill();
  }
  const center = ctx.createRadialGradient(tower.x - 3, tower.y - 15, 2, tower.x, tower.y - 12, 10);
  center.addColorStop(0, '#fff7bd');
  center.addColorStop(1, '#a16207');
  ctx.fillStyle = center;
  ctx.beginPath();
  ctx.arc(tower.x, tower.y - 12, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#10140f';
  ctx.font = '800 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(tower.level), tower.x, tower.y - 12);
  if (active) {
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tower.x, tower.y - 2, 29, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  const p = pathPoint(enemy.progress);
  const boss = enemy.kind === 'boss';
  const radius = boss ? 20 : 12;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.36)';
  ctx.shadowBlur = 10;
  const body = ctx.createRadialGradient(p.x - 4, p.y - 5, 2, p.x, p.y, radius);
  body.addColorStop(0, boss ? '#fecaca' : '#d9f99d');
  body.addColorStop(1, boss ? '#b91c1c' : '#4d7c0f');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#17210f';
  ctx.beginPath();
  ctx.arc(p.x - radius * 0.32, p.y - radius * 0.16, 2.2, 0, Math.PI * 2);
  ctx.arc(p.x + radius * 0.32, p.y - radius * 0.16, 2.2, 0, Math.PI * 2);
  ctx.fill();
  if (enemy.slow > 0) {
    ctx.strokeStyle = '#67e8f9';
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius + 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (enemy.poison > 0) {
    ctx.fillStyle = '#c084fc';
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(p.x + radius * 0.5, p.y - radius * 0.55, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#0b1208';
  ctx.fillRect(p.x - 20, p.y - radius - 12, 40, 5);
  ctx.fillStyle = boss ? '#fca5a5' : '#fef08a';
  ctx.fillRect(p.x - 20, p.y - radius - 12, 40 * clamp(enemy.hp / enemy.maxHp, 0, 1), 5);
  ctx.restore();
}

function drawPlacementPreview(ctx: CanvasRenderingContext2D, point: Point, def: TowerDef, allowed: boolean) {
  ctx.save();
  const color = allowed ? def.color : '#ef4444';
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(point.x, point.y, def.range, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.42;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.arc(point.x, point.y, def.range, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = allowed ? 0.82 : 0.58;
  ctx.fillStyle = allowed ? def.color : '#ef4444';
  ctx.beginPath();
  ctx.arc(point.x, point.y, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.52)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}
