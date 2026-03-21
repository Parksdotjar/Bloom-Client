import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Gamepad2, Palette, Play, RefreshCcw, Sparkles } from 'lucide-react';

type GameTab = 'bloom' | 'flappy' | 'whiteboard';
type FlappyStatus = 'idle' | 'running' | 'paused' | 'over';
type PurchaseMode = 1 | 10 | 25 | 'max';

type Pipe = { x: number; gapY: number; scored: boolean };
type FlappyRuntime = { birdY: number; birdVelocity: number; pipes: Pipe[]; score: number; status: FlappyStatus; lastTs: number };
type Point = { x: number; y: number };

type UpgradeDef = {
  id: string;
  name: string;
  desc: string;
  cat: 'hand' | 'garden' | 'automation' | 'arcane' | 'synergy';
  base: number;
  growth: number;
  click?: number;
  cps?: number;
  clickMult?: number;
  cpsMult?: number;
  crit?: number;
  critMult?: number;
  special?: 'bee' | 'greenhouse' | 'cpsFromClick' | 'clickFromOwned';
  strength?: number;
  unlock?: number;
};

type ClickerState = {
  petals: number;
  total: number;
  clicks: number;
  owned: Record<string, number>;
  burstUntil: number;
  burstCooldownUntil: number;
  lastTick: number;
};

type ClickerStats = {
  click: number;
  cps: number;
  critChance: number;
  critMult: number;
  burstMult: number;
  ownedTotal: number;
  pollinators: number;
};

const FLAPPY_KEY = 'bloom_games_flappy_high_score';
const WHITEBOARD_KEY = 'bloom_games_whiteboard_png';
const CLICKER_KEY = 'bloom_games_flower_clicker_v1';

const FLAPPY_W = 420;
const FLAPPY_H = 640;
const BIRD_X = 112;
const BIRD_R = 14;
const PIPE_W = 74;
const PIPE_GAP = 180;
const PIPE_SPACE = 248;
const PIPE_SPEED = 2.65;
const GROUND_H = 96;
const GRAVITY = 0.34;
const FLAP_V = -7.1;

const WHITEBOARD_COLORS = ['#ffffff', '#fdba74', '#fb7185', '#facc15', '#4ade80', '#38bdf8', '#c084fc', '#0f172a'];

const UPGRADES: UpgradeDef[] = [
  { id: 'petal_tap', name: 'Petal Tap', desc: '+1 click', cat: 'hand', base: 15, growth: 1.15, click: 1, unlock: 0 },
  { id: 'silk_gloves', name: 'Silk Gloves', desc: '+4 click', cat: 'hand', base: 80, growth: 1.17, click: 4 },
  { id: 'thorn_stylus', name: 'Thorn Stylus', desc: 'Click x1.20', cat: 'hand', base: 420, growth: 1.18, clickMult: 1.2 },
  { id: 'scent_focus', name: 'Scent Focus', desc: '+1.5% crit chance', cat: 'hand', base: 1200, growth: 1.19, crit: 0.015 },
  { id: 'ruby_pruners', name: 'Ruby Pruners', desc: '+22 click', cat: 'hand', base: 5300, growth: 1.19, click: 22 },

  { id: 'window_planter', name: 'Window Planter', desc: '+0.7 cps', cat: 'garden', base: 25, growth: 1.16, cps: 0.7, unlock: 0 },
  { id: 'patio_greenbeds', name: 'Patio Greenbeds', desc: '+2.4 cps', cat: 'garden', base: 120, growth: 1.17, cps: 2.4 },
  { id: 'bee_hive', name: 'Bee Hive', desc: '+8 cps', cat: 'garden', base: 420, growth: 1.18, cps: 8 },
  { id: 'mason_bee_colony', name: 'Mason Bee Colony', desc: '+24 cps', cat: 'garden', base: 1600, growth: 1.18, cps: 24 },
  { id: 'hummingbird_perch', name: 'Hummingbird Perch', desc: '+68 cps', cat: 'garden', base: 6400, growth: 1.19, cps: 68 },
  { id: 'dewdrop_sprinklers', name: 'Dewdrop Sprinklers', desc: '+180 cps', cat: 'garden', base: 14500, growth: 1.2, cps: 180 },

  { id: 'drip_lines', name: 'Drip Lines', desc: '+430 cps', cat: 'automation', base: 38000, growth: 1.2, cps: 430 },
  { id: 'solar_greenhouse', name: 'Solar Greenhouse', desc: '+1,100 cps', cat: 'automation', base: 120000, growth: 1.2, cps: 1100 },
  { id: 'seed_drones', name: 'Seed Drones', desc: '+2,900 cps', cat: 'automation', base: 370000, growth: 1.2, cps: 2900 },
  { id: 'petal_printers', name: 'Petal Printers', desc: 'CPS scales with click', cat: 'automation', base: 980000, growth: 1.21, special: 'cpsFromClick', strength: 0.36 },
  { id: 'robot_florists', name: 'Robot Florists', desc: '+7,600 cps', cat: 'automation', base: 2800000, growth: 1.21, cps: 7600 },

  { id: 'moonlit_dew', name: 'Moonlit Dew', desc: 'Click x1.34', cat: 'arcane', base: 19000, growth: 1.2, clickMult: 1.34 },
  { id: 'sunbeam_prisms', name: 'Sunbeam Prisms', desc: 'CPS x1.22', cat: 'arcane', base: 64000, growth: 1.2, cpsMult: 1.22 },
  { id: 'nectar_alchemy', name: 'Nectar Alchemy', desc: 'CPS from pollinators', cat: 'arcane', base: 260000, growth: 1.21, special: 'bee', strength: 1.85 },
  { id: 'orchid_portal', name: 'Orchid Portal', desc: '+19,000 cps', cat: 'arcane', base: 1900000, growth: 1.22, cps: 19000 },
  { id: 'starlight_canopy', name: 'Starlight Canopy', desc: '+3.5% crit, stronger crits', cat: 'arcane', base: 6400000, growth: 1.22, crit: 0.035, critMult: 0.55 },
  { id: 'sunshower_ritual', name: 'Sunshower Ritual', desc: 'Unlock burst', cat: 'arcane', base: 12000000, growth: 1.22, cps: 14000 },
  { id: 'aurora_festival', name: 'Aurora Festival', desc: 'Click x1.28, CPS x1.16', cat: 'arcane', base: 26000000, growth: 1.22, clickMult: 1.28, cpsMult: 1.16 },

  { id: 'mycelium_network', name: 'Mycelium Network', desc: 'CPS from greenhouse stack', cat: 'synergy', base: 54000000, growth: 1.23, special: 'greenhouse', strength: 4.2 },
  { id: 'pollinator_union', name: 'Pollinator Union', desc: 'Click from pollinators', cat: 'synergy', base: 92000000, growth: 1.23, special: 'clickFromOwned', strength: 1.1 },
  { id: 'eternal_spring', name: 'Eternal Spring', desc: 'Big global boost', cat: 'synergy', base: 420000000, growth: 1.24, cpsMult: 1.52, clickMult: 1.32, crit: 0.06, critMult: 0.9 }
];

const UPGRADE_MAP = new Map(UPGRADES.map((u) => [u.id, u]));
const POLLINATOR_IDS = new Set(['bee_hive', 'mason_bee_colony', 'hummingbird_perch']);
const GREENHOUSE_IDS = new Set(['drip_lines', 'solar_greenhouse', 'seed_drones', 'petal_printers', 'robot_florists']);
const CATEGORIES: Array<{ id: UpgradeDef['cat']; title: string }> = [
  { id: 'hand', title: 'Petal Press' },
  { id: 'garden', title: 'Garden Crew' },
  { id: 'automation', title: 'Greenhouse Tech' },
  { id: 'arcane', title: 'Arcane Bloom' },
  { id: 'synergy', title: 'Synergy Boosts' }
];

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }

function formatNum(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  if (abs < 1000) return abs >= 100 ? value.toFixed(0) : abs >= 10 ? value.toFixed(1) : value.toFixed(2);
  const suffix = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'];
  let scaled = abs;
  let idx = -1;
  while (scaled >= 1000 && idx < suffix.length - 1) { scaled /= 1000; idx += 1; }
  const sign = value < 0 ? '-' : '';
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return `${sign}${scaled.toFixed(digits)}${suffix[idx]}`;
}

function readThemeColor(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function toCanvasPoint(canvas: HTMLCanvasElement, point: { clientX: number; clientY: number }): Point {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / Math.max(1, rect.width);
  const scaleY = canvas.height / Math.max(1, rect.height);
  return {
    x: (point.clientX - rect.left) * scaleX,
    y: (point.clientY - rect.top) * scaleY
  };
}

function createPipe(startX: number): Pipe {
  const minY = 160;
  const maxY = FLAPPY_H - GROUND_H - 160;
  return { x: startX, gapY: Math.random() * (maxY - minY) + minY, scored: false };
}

function createFlappyRuntime(): FlappyRuntime {
  return { birdY: FLAPPY_H * 0.45, birdVelocity: 0, pipes: [createPipe(FLAPPY_W + 64)], score: 0, status: 'idle', lastTs: 0 };
}

function upgradeCost(def: UpgradeDef, owned: number) { return Math.floor(def.base * Math.pow(def.growth, owned)); }

function defaultClicker(now = Date.now()): ClickerState {
  return { petals: 0, total: 0, clicks: 0, owned: {}, burstUntil: 0, burstCooldownUntil: 0, lastTick: now };
}

function computeClickerStats(state: ClickerState): ClickerStats {
  let click = 1;
  let cps = 0;
  let clickMult = 1;
  let cpsMult = 1;
  let critChance = 0.01;
  let critMult = 2;
  let ownedTotal = 0;
  let pollinators = 0;
  let greenhouse = 0;

  for (const up of UPGRADES) {
    const count = state.owned[up.id] ?? 0;
    if (count <= 0) continue;
    ownedTotal += count;
    if (POLLINATOR_IDS.has(up.id)) pollinators += count;
    if (GREENHOUSE_IDS.has(up.id)) greenhouse += count;
    if (up.click) click += up.click * count;
    if (up.cps) cps += up.cps * count;
    if (up.clickMult) clickMult *= Math.pow(up.clickMult, count);
    if (up.cpsMult) cpsMult *= Math.pow(up.cpsMult, count);
    if (up.crit) critChance += up.crit * count;
    if (up.critMult) critMult += up.critMult * count;
  }

  const clickAfter = click * clickMult;
  const cpsAfter = cps * cpsMult;
  let bonusClick = 0;
  let bonusCps = 0;

  for (const up of UPGRADES) {
    const count = state.owned[up.id] ?? 0;
    if (count <= 0 || !up.special) continue;
    const s = up.strength ?? 0;
    if (up.special === 'bee') bonusCps += count * s * pollinators;
    if (up.special === 'greenhouse') bonusCps += count * s * greenhouse;
    if (up.special === 'cpsFromClick') bonusCps += count * s * clickAfter;
    if (up.special === 'clickFromOwned') bonusClick += count * s * pollinators;
  }

  const ritualLevel = state.owned.sunshower_ritual ?? 0;
  const festivalLevel = state.owned.aurora_festival ?? 0;
  return {
    click: Math.max(1, clickAfter + bonusClick),
    cps: Math.max(0, cpsAfter + bonusCps),
    critChance: clamp(critChance, 0, 0.85),
    critMult: Math.max(1.5, critMult),
    burstMult: 1.65 + ritualLevel * 0.32 + festivalLevel * 0.08,
    ownedTotal,
    pollinators
  };
}

function loadClicker(): ClickerState {
  const now = Date.now();
  const fallback = defaultClicker(now);
  try {
    const raw = localStorage.getItem(CLICKER_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ClickerState>;
    const owned: Record<string, number> = {};
    for (const up of UPGRADES) {
      const n = Number((parsed.owned as Record<string, unknown> | undefined)?.[up.id]);
      if (Number.isFinite(n) && n > 0) owned[up.id] = Math.floor(n);
    }
    const restored: ClickerState = {
      petals: Number.isFinite(parsed.petals) ? Math.max(0, Number(parsed.petals)) : 0,
      total: Number.isFinite(parsed.total) ? Math.max(0, Number(parsed.total)) : 0,
      clicks: Number.isFinite(parsed.clicks) ? Math.max(0, Math.floor(Number(parsed.clicks))) : 0,
      owned,
      burstUntil: Number.isFinite(parsed.burstUntil) ? Math.max(0, Number(parsed.burstUntil)) : 0,
      burstCooldownUntil: Number.isFinite(parsed.burstCooldownUntil) ? Math.max(0, Number(parsed.burstCooldownUntil)) : 0,
      lastTick: Number.isFinite(parsed.lastTick) ? Number(parsed.lastTick) : now
    };
    const offlineSec = clamp((now - restored.lastTick) / 1000, 0, 8 * 3600);
    if (offlineSec > 2) {
      const stats = computeClickerStats(restored);
      const gain = stats.cps * offlineSec * 0.65;
      restored.petals += gain;
      restored.total += gain;
    }
    restored.lastTick = now;
    return restored;
  } catch {
    return fallback;
  }
}
export function Games() {
  const [tab, setTab] = useState<GameTab>('bloom');

  const [flappyStatus, setFlappyStatus] = useState<FlappyStatus>('idle');
  const [flappyScore, setFlappyScore] = useState(0);
  const [flappyBest, setFlappyBest] = useState<number>(() => {
    const n = Number(localStorage.getItem(FLAPPY_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  });

  const [brushColor, setBrushColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(8);
  const [eraser, setEraser] = useState(false);

  const [clicker, setClicker] = useState<ClickerState>(() => loadClicker());
  const [buyMode, setBuyMode] = useState<PurchaseMode>(1);
  const [notice, setNotice] = useState<{ id: number; text: string; crit: boolean } | null>(null);

  const flappyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const flappyRuntimeRef = useRef<FlappyRuntime>(createFlappyRuntime());
  const flappyStatusRef = useRef<FlappyStatus>('idle');
  const flappyBestRef = useRef(flappyBest);

  const whiteboardRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const pointerRef = useRef<number | null>(null);
  const pointRef = useRef<Point | null>(null);
  const scaleRef = useRef({ x: 1, y: 1 });
  const brushColorRef = useRef(brushColor);
  const brushSizeRef = useRef(brushSize);
  const eraserRef = useRef(eraser);

  const clickerRef = useRef(clicker);
  const noticeRef = useRef(0);

  useEffect(() => { flappyBestRef.current = flappyBest; }, [flappyBest]);
  useEffect(() => { brushColorRef.current = brushColor; }, [brushColor]);
  useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);
  useEffect(() => { eraserRef.current = eraser; }, [eraser]);
  useEffect(() => { clickerRef.current = clicker; }, [clicker]);

  const clickerStats = useMemo(() => computeClickerStats(clicker), [clicker.owned]);
  const now = Date.now();
  const burstUnlocked = (clicker.owned.sunshower_ritual ?? 0) > 0;
  const burstActive = now < clicker.burstUntil;
  const burstLeft = burstActive ? Math.max(0, Math.ceil((clicker.burstUntil - now) / 1000)) : 0;
  const burstCooldown = !burstActive ? Math.max(0, Math.ceil((clicker.burstCooldownUntil - now) / 1000)) : 0;
  const runtimeMult = burstActive ? clickerStats.burstMult : 1;

  const setFlappyState = useCallback((next: FlappyStatus) => {
    flappyRuntimeRef.current.status = next;
    if (flappyStatusRef.current !== next) {
      flappyStatusRef.current = next;
      setFlappyStatus(next);
    }
  }, []);

  const startFlappy = useCallback(() => {
    flappyRuntimeRef.current = createFlappyRuntime();
    flappyRuntimeRef.current.status = 'running';
    flappyStatusRef.current = 'running';
    setFlappyStatus('running');
    setFlappyScore(0);
  }, []);

  const flap = useCallback(() => {
    const rt = flappyRuntimeRef.current;
    if (rt.status === 'idle' || rt.status === 'over') startFlappy();
    if (flappyRuntimeRef.current.status !== 'running') return;
    flappyRuntimeRef.current.birdVelocity = FLAP_V;
  }, [startFlappy]);

  const togglePause = useCallback(() => {
    const rt = flappyRuntimeRef.current;
    if (rt.status === 'running') setFlappyState('paused');
    else if (rt.status === 'paused') {
      rt.lastTs = 0;
      setFlappyState('running');
    }
  }, [setFlappyState]);

  const resetFlappyRound = useCallback(() => {
    flappyRuntimeRef.current = createFlappyRuntime();
    flappyStatusRef.current = 'idle';
    setFlappyStatus('idle');
    setFlappyScore(0);
  }, []);

  const clearFlappyBest = useCallback(() => {
    localStorage.removeItem(FLAPPY_KEY);
    flappyBestRef.current = 0;
    setFlappyBest(0);
  }, []);

  const resizeWhiteboard = useCallback(() => {
    const canvas = whiteboardRef.current;
    if (!canvas) return;
    const parentW = canvas.parentElement?.clientWidth ?? 640;
    const cssW = Math.max(320, Math.floor(parentW));
    const cssH = Math.max(240, Math.floor(cssW * 0.56));
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const snapshot = document.createElement('canvas');
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    const snapCtx = snapshot.getContext('2d');
    if (snapCtx && canvas.width > 0 && canvas.height > 0) snapCtx.drawImage(canvas, 0, 0);

    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    scaleRef.current = { x: canvas.width / cssW, y: canvas.height / cssH };

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (snapshot.width > 0 && snapshot.height > 0) {
      ctx.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, canvas.width, canvas.height);
      return;
    }

    const saved = localStorage.getItem(WHITEBOARD_KEY);
    if (!saved) return;
    const image = new Image();
    image.onload = () => ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = saved;
  }, []);

  const drawHardStroke = useCallback((from: Point, to: Point) => {
    const canvas = whiteboardRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = (scaleRef.current.x + scaleRef.current.y) / 2;
    const size = Math.max(1, Math.round(brushSizeRef.current * scale));
    const half = Math.floor(size / 2);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = eraserRef.current ? 'destination-out' : 'source-over';
    if (!eraserRef.current) ctx.fillStyle = brushColorRef.current;

    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = Math.round(from.x + dx * t) - half;
      const y = Math.round(from.y + dy * t) - half;
      ctx.fillRect(x, y, size, size);
    }
    ctx.restore();
  }, []);

  const buyUpgrade = useCallback((id: string) => {
    setClicker((prev) => {
      const def = UPGRADE_MAP.get(id);
      if (!def) return prev;
      const already = prev.owned[id] ?? 0;
      const max = buyMode === 'max' ? Number.POSITIVE_INFINITY : buyMode;
      let bought = 0;
      let petals = prev.petals;
      while (bought < max) {
        const cost = upgradeCost(def, already + bought);
        if (petals + 1e-9 < cost) break;
        petals -= cost;
        bought += 1;
      }
      if (bought === 0) return prev;
      return {
        ...prev,
        petals,
        owned: { ...prev.owned, [id]: already + bought },
        lastTick: Date.now()
      };
    });
  }, [buyMode]);

  const clickBloom = useCallback(() => {
    const snapshot = clickerRef.current;
    const stats = computeClickerStats(snapshot);
    const time = Date.now();
    let gain = stats.click * (time < snapshot.burstUntil ? stats.burstMult : 1);
    const critical = Math.random() < stats.critChance;
    if (critical) gain *= stats.critMult;

    setClicker((prev) => ({ ...prev, petals: prev.petals + gain, total: prev.total + gain, clicks: prev.clicks + 1, lastTick: time }));

    noticeRef.current += 1;
    setNotice({ id: noticeRef.current, text: `+${formatNum(gain)} petals`, crit: critical });
  }, []);

  const activateBurst = useCallback(() => {
    setClicker((prev) => {
      const level = prev.owned.sunshower_ritual ?? 0;
      if (level <= 0) return prev;
      const time = Date.now();
      if (time < prev.burstUntil || time < prev.burstCooldownUntil) return prev;
      const duration = 16 + level * 4;
      const cooldown = Math.max(34, 86 - level * 6);
      return { ...prev, burstUntil: time + duration * 1000, burstCooldownUntil: time + cooldown * 1000, lastTick: time };
    });
  }, []);

  const resetClicker = useCallback(() => {
    localStorage.removeItem(CLICKER_KEY);
    setClicker(defaultClicker(Date.now()));
    setNotice(null);
  }, []);
  useEffect(() => {
    const persist = () => localStorage.setItem(CLICKER_KEY, JSON.stringify({ ...clickerRef.current, lastTick: Date.now() }));
    const timer = window.setInterval(persist, 1200);
    window.addEventListener('beforeunload', persist);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('beforeunload', persist);
      persist();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClicker((prev) => {
        const time = Date.now();
        const dt = Math.max(0, (time - prev.lastTick) / 1000);
        if (dt <= 0) return prev;
        const stats = computeClickerStats(prev);
        const mult = time < prev.burstUntil ? stats.burstMult : 1;
        const gain = stats.cps * dt * mult;
        if (gain <= 0) return { ...prev, lastTick: time };
        return { ...prev, petals: prev.petals + gain, total: prev.total + gain, lastTick: time };
      });
    }, 200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (tab !== 'flappy') return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;

      if (event.key === ' ' || event.key === 'ArrowUp') {
        event.preventDefault();
        flap();
      }
      if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        togglePause();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tab, flap, togglePause]);

  useEffect(() => {
    if (tab !== 'flappy' && flappyRuntimeRef.current.status === 'running') setFlappyState('paused');
  }, [tab, setFlappyState]);

  useEffect(() => {
    let frame = 0;
    const loop = (ts: number) => {
      const canvas = flappyCanvasRef.current;
      if (!canvas) {
        frame = window.requestAnimationFrame(loop);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        frame = window.requestAnimationFrame(loop);
        return;
      }

      const rt = flappyRuntimeRef.current;
      const dtMs = rt.lastTs > 0 ? Math.min(40, ts - rt.lastTs) : 16.6667;
      rt.lastTs = ts;
      const step = dtMs / 16.6667;

      if (rt.status === 'running') {
        rt.birdVelocity += GRAVITY * step;
        rt.birdY += rt.birdVelocity * step;
        rt.birdY = clamp(rt.birdY, -24, FLAPPY_H - GROUND_H + 8);

        const lastPipe = rt.pipes[rt.pipes.length - 1];
        if (!lastPipe || lastPipe.x <= FLAPPY_W - PIPE_SPACE) rt.pipes.push(createPipe(FLAPPY_W + PIPE_W));

        for (const pipe of rt.pipes) {
          pipe.x -= PIPE_SPEED * step;
          if (!pipe.scored && pipe.x + PIPE_W < BIRD_X) {
            pipe.scored = true;
            rt.score += 1;
            setFlappyScore(rt.score);
            if (rt.score > flappyBestRef.current) {
              flappyBestRef.current = rt.score;
              localStorage.setItem(FLAPPY_KEY, String(rt.score));
              setFlappyBest(rt.score);
            }
          }
        }

        rt.pipes = rt.pipes.filter((pipe) => pipe.x + PIPE_W > -6);

        const top = rt.birdY - BIRD_R;
        const bottom = rt.birdY + BIRD_R;
        const hitGround = bottom >= FLAPPY_H - GROUND_H;
        const hitCeiling = top <= 0;

        let hitPipe = false;
        for (const pipe of rt.pipes) {
          const gapTop = pipe.gapY - PIPE_GAP / 2;
          const gapBottom = pipe.gapY + PIPE_GAP / 2;
          const insideX = BIRD_X + BIRD_R > pipe.x && BIRD_X - BIRD_R < pipe.x + PIPE_W;
          if (insideX && (top < gapTop || bottom > gapBottom)) {
            hitPipe = true;
            break;
          }
        }

        if (hitGround || hitCeiling || hitPipe) setFlappyState('over');
      } else if (rt.status === 'idle') {
        rt.birdVelocity = 0;
        rt.birdY = FLAPPY_H * 0.45 + Math.sin(ts / 240) * 8;
      }

      const text = readThemeColor('--g-text', '#f4f5fc');
      const sky = ctx.createLinearGradient(0, 0, 0, FLAPPY_H);
      sky.addColorStop(0, '#5dc6ff');
      sky.addColorStop(1, '#b8ecff');

      ctx.clearRect(0, 0, FLAPPY_W, FLAPPY_H);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, FLAPPY_W, FLAPPY_H);

      for (const pipe of rt.pipes) {
        const gapTop = pipe.gapY - PIPE_GAP / 2;
        const gapBottom = pipe.gapY + PIPE_GAP / 2;

        const pg = ctx.createLinearGradient(pipe.x, 0, pipe.x + PIPE_W, 0);
        pg.addColorStop(0, '#1f9d5e');
        pg.addColorStop(0.55, '#31d182');
        pg.addColorStop(1, '#1c8e54');
        ctx.fillStyle = pg;
        ctx.fillRect(pipe.x, 0, PIPE_W, gapTop);
        ctx.fillRect(pipe.x, gapBottom, PIPE_W, FLAPPY_H - GROUND_H - gapBottom);

        ctx.fillStyle = '#2fdf8c';
        ctx.fillRect(pipe.x - 6, gapTop - 20, PIPE_W + 12, 20);
        ctx.fillRect(pipe.x - 6, gapBottom, PIPE_W + 12, 20);
      }

      const gg = ctx.createLinearGradient(0, FLAPPY_H - GROUND_H, 0, FLAPPY_H);
      gg.addColorStop(0, '#d9c98d');
      gg.addColorStop(1, '#bfaa67');
      ctx.fillStyle = gg;
      ctx.fillRect(0, FLAPPY_H - GROUND_H, FLAPPY_W, GROUND_H);

      const tilt = clamp(rt.birdVelocity * 0.06, -0.6, 0.8);
      const wing = Math.sin(ts / 82) * 0.85;
      ctx.save();
      ctx.translate(BIRD_X, rt.birdY);
      ctx.rotate(tilt);
      const body = ctx.createRadialGradient(-4, -6, 2, 0, 0, 20);
      body.addColorStop(0, '#ffe884');
      body.addColorStop(0.7, '#ffce46');
      body.addColorStop(1, '#f2a61a');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2a61a';
      ctx.beginPath();
      ctx.ellipse(-4, 2 + wing, 8.5, 6, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff9e2f';
      ctx.beginPath();
      ctx.moveTo(13, -1);
      ctx.lineTo(24, 2);
      ctx.lineTo(13, 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(6, -5, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#171717';
      ctx.beginPath();
      ctx.arc(7, -4.5, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = '800 42px sans-serif';
      ctx.fillText(String(rt.score), FLAPPY_W / 2, 72);
      ctx.font = '700 12px sans-serif';
      ctx.fillText('SPACE / CLICK TO FLAP', FLAPPY_W / 2, 96);

      if (rt.status === 'idle' || rt.status === 'over' || rt.status === 'paused') {
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.fillRect(0, 0, FLAPPY_W, FLAPPY_H);
        ctx.fillStyle = text;
        ctx.font = '800 26px sans-serif';
        const label = rt.status === 'over' ? 'Game Over' : rt.status === 'paused' ? 'Paused' : 'Tap Start';
        ctx.fillText(label, FLAPPY_W / 2, FLAPPY_H / 2 - 12);
      }

      frame = window.requestAnimationFrame(loop);
    };

    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [setFlappyState]);

  useEffect(() => {
    resizeWhiteboard();
    const canvas = whiteboardRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const observer = new ResizeObserver(() => resizeWhiteboard());
    if (parent) observer.observe(parent);
    window.addEventListener('resize', resizeWhiteboard);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resizeWhiteboard);
    };
  }, [resizeWhiteboard]);

  const flappyStatusLabel = flappyStatus === 'running' ? 'Running' : flappyStatus === 'paused' ? 'Paused' : flappyStatus === 'over' ? 'Game Over' : 'Ready';

  return (
    <div className="mx-auto max-w-[1400px] min-h-full space-y-4">
      <section className="g-panel-strong p-6">
        <p className="text-[10px] uppercase tracking-[0.2em] font-extrabold g-accent-text">Games</p>
        <h1 className="mt-1 text-5xl font-extrabold text-white">Arcade + Creative Lab</h1>
        <p className="mt-2 text-sm g-muted">Flower clicker, Flappy Bird, and a crisp-edged whiteboard.</p>
      </section>

      <section className="g-panel p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setTab('bloom')} className={clsx('h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em]', tab === 'bloom' ? 'g-btn-accent' : 'g-btn')}><span className="inline-flex items-center gap-2"><Sparkles size={13} /> Bloom Clicker</span></button>
          <button onClick={() => setTab('flappy')} className={clsx('h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em]', tab === 'flappy' ? 'g-btn-accent' : 'g-btn')}><span className="inline-flex items-center gap-2"><Gamepad2 size={13} /> Flappy Bird</span></button>
          <button onClick={() => setTab('whiteboard')} className={clsx('h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em]', tab === 'whiteboard' ? 'g-btn-accent' : 'g-btn')}><span className="inline-flex items-center gap-2"><Palette size={13} /> Whiteboard</span></button>
        </div>
      </section>

      {tab === 'bloom' && (
        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="g-panel p-4 space-y-4 h-fit">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/50">Petals</p>
              <p className="mt-1 text-3xl font-extrabold text-white">{formatNum(clicker.petals)}</p>
              <p className="text-xs g-muted mt-1">Total harvested: {formatNum(clicker.total)}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/45">Per Click</p>
                <p className="mt-1 text-xl font-extrabold text-white">{formatNum(clickerStats.click * runtimeMult)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/45">Per Second</p>
                <p className="mt-1 text-xl font-extrabold g-accent-text">{formatNum(clickerStats.cps * runtimeMult)}</p>
              </div>
            </div>

            <button onClick={clickBloom} className="relative mx-auto flex h-56 w-56 select-none items-center justify-center rounded-full border border-white/20 text-center" style={{ background: 'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.9), rgba(255,255,255,0.35) 26%, color-mix(in srgb, var(--g-accent) 70%, #ffccdf 30%) 48%, color-mix(in srgb, var(--g-accent) 45%, #000000 55%) 100%)', boxShadow: '0 18px 46px rgba(0,0,0,0.28), inset 0 4px 12px rgba(255,255,255,0.35)' }}>
              <div className="pointer-events-none">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-black/65">Tap To Harvest</p>
                <p className="mt-1 text-3xl font-extrabold text-black/80">Bloom</p>
                <p className="mt-1 text-xs font-semibold text-black/60">{clicker.clicks} clicks</p>
              </div>
            </button>

            {notice && <p key={notice.id} className={clsx('text-center text-sm font-extrabold', notice.crit ? 'text-amber-200' : 'text-white/75')}>{notice.crit ? `Critical ${notice.text}` : notice.text}</p>}

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/45">Sunshower Burst</p>
                {burstUnlocked && <p className="text-[11px] font-bold text-white/72">x{clickerStats.burstMult.toFixed(2)}</p>}
              </div>
              {!burstUnlocked && <p className="text-xs g-muted mt-2">Unlock with `Sunshower Ritual` in Arcane Bloom.</p>}
              {burstUnlocked && (
                <>
                  <button onClick={activateBurst} disabled={burstActive || burstCooldown > 0} className="mt-2 w-full g-btn-accent h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] disabled:opacity-45">
                    {burstActive ? `Active (${burstLeft}s)` : burstCooldown > 0 ? `Cooldown (${burstCooldown}s)` : 'Activate Burst'}
                  </button>
                  <p className="mt-2 text-xs text-white/60">Boosts click and auto petals together.</p>
                </>
              )}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/45">Shop Mode</p>
              <div className="mt-2 flex items-center gap-2">
                {[1, 10, 25].map((mode) => (
                  <button key={mode} onClick={() => setBuyMode(mode as PurchaseMode)} className={clsx('h-9 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em]', buyMode === mode ? 'g-btn-accent' : 'g-btn')}>x{mode}</button>
                ))}
                <button onClick={() => setBuyMode('max')} className={clsx('h-9 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em]', buyMode === 'max' ? 'g-btn-accent' : 'g-btn')}>Max</button>
              </div>
            </div>

            <button onClick={resetClicker} className="w-full g-btn h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-2"><RefreshCcw size={13} />Reset Flower Save</button>
          </aside>

          <section className="g-panel p-4 space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-white/62">Live Stats</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"><p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Crit Chance</p><p className="text-sm font-bold text-white">{(clickerStats.critChance * 100).toFixed(1)}%</p></div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"><p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Crit Power</p><p className="text-sm font-bold text-white">x{clickerStats.critMult.toFixed(2)}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"><p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Owned Upgrades</p><p className="text-sm font-bold text-white">{clickerStats.ownedTotal}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"><p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Pollinators</p><p className="text-sm font-bold text-white">{clickerStats.pollinators}</p></div>
              </div>
            </div>

            <div className="space-y-3">
              {CATEGORIES.map((cat) => {
                const list = UPGRADES.filter((up) => up.cat === cat.id);
                return (
                  <section key={cat.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                    <div className="mb-3 flex items-center justify-between gap-2"><p className="text-sm font-extrabold text-white">{cat.title}</p><span className="text-[10px] uppercase tracking-[0.14em] text-white/45">{list.length} upgrades</span></div>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {list.map((up) => {
                        const owned = clicker.owned[up.id] ?? 0;
                        const unlock = up.unlock ?? Math.floor(up.base * 0.32);
                        const unlocked = clicker.total >= unlock || owned > 0;
                        const cost = upgradeCost(up, owned);
                        const afford = clicker.petals >= cost;
                        return (
                          <article key={up.id} className={clsx('rounded-xl border p-3 transition', unlocked ? 'border-white/10 bg-white/[0.03]' : 'border-white/8 bg-white/[0.01] opacity-60')}>
                            <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-extrabold text-white">{up.name}</p><p className="text-[11px] text-white/60">{up.desc}</p></div><span className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-bold text-white/70">Lv {owned}</span></div>
                            {!unlocked && <p className="mt-2 text-[11px] text-amber-100/75">Unlock at {formatNum(unlock)} total petals.</p>}
                            <div className="mt-3 flex items-center justify-between gap-2"><p className="text-[11px] font-extrabold g-accent-text">{formatNum(cost)} petals</p><button onClick={() => buyUpgrade(up.id)} disabled={!unlocked || !afford} className={clsx('h-8 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em] disabled:opacity-45', afford && unlocked ? 'g-btn-accent' : 'g-btn')}>Buy {buyMode === 'max' ? 'Max' : `x${buyMode}`}</button></div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {tab === 'flappy' && (
        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="g-panel p-4 space-y-4 h-fit">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/50">Status</p><p className="mt-1 text-xl font-extrabold text-white">{flappyStatusLabel}</p></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/45">Score</p><p className="mt-1 text-2xl font-extrabold text-white">{flappyScore}</p></div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/45">Best</p><p className="mt-1 text-2xl font-extrabold g-accent-text">{flappyBest}</p></div>
            </div>
            <div className="space-y-2">
              <button onClick={startFlappy} className="w-full g-btn-accent h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-2"><Play size={13} />Start / Restart</button>
              <button onClick={togglePause} disabled={flappyStatus !== 'running' && flappyStatus !== 'paused'} className="w-full g-btn h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] disabled:opacity-45">{flappyStatus === 'paused' ? 'Resume' : 'Pause'}</button>
              <button onClick={resetFlappyRound} className="w-full g-btn h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em]">Reset Round</button>
              <button onClick={clearFlappyBest} className="w-full g-btn h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-2"><RefreshCcw size={13} />Clear High Score</button>
            </div>
          </aside>

          <section className="g-panel p-3"><div className="mx-auto w-full max-w-[420px]"><canvas ref={flappyCanvasRef} width={FLAPPY_W} height={FLAPPY_H} onPointerDown={() => flap()} className="games-hd-canvas w-full rounded-2xl border border-white/10 bg-black/20 touch-none select-none" style={{ boxShadow: 'var(--g-panel-shadow)' }} /></div></section>
        </div>
      )}

      {tab === 'whiteboard' && (
        <div className="space-y-4">
          <section className="g-panel p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2">
                {WHITEBOARD_COLORS.map((color) => (
                  <button key={color} onClick={() => { setBrushColor(color); setEraser(false); }} className={clsx('h-8 w-8 rounded-full border transition', brushColor === color && !eraser ? 'border-white/70 ring-2 ring-white/30' : 'border-white/20 hover:border-white/40')} style={{ background: color }} aria-label={`Brush color ${color}`} />
                ))}
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-white/72">Size
                <input type="range" min={2} max={42} value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} className="w-44" style={{ accentColor: 'var(--g-accent)' }} />
                <span className="w-8 text-right tabular-nums">{brushSize}</span>
              </label>

              <button onClick={() => setEraser((prev) => !prev)} className={clsx('h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em]', eraser ? 'g-btn-accent' : 'g-btn')}>{eraser ? 'Eraser On' : 'Eraser Off'}</button>
              <button onClick={() => {
                const canvas = whiteboardRef.current;
                if (!canvas) return;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                localStorage.removeItem(WHITEBOARD_KEY);
              }} className="g-btn h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-2"><RefreshCcw size={13} />Clear</button>
            </div>
          </section>

          <section className="g-panel p-3">
            <div className="w-full">
              <canvas
                ref={whiteboardRef}
                className="games-hd-canvas w-full rounded-2xl border border-white/10 touch-none"
                style={{ background: 'color-mix(in srgb, var(--g-surface-strong) 84%, transparent)', boxShadow: 'var(--g-panel-shadow)' }}
                onPointerDown={(event) => {
                  if (event.pointerType === 'mouse' && event.button !== 0) return;
                  const canvas = whiteboardRef.current;
                  if (!canvas) return;
                  canvas.setPointerCapture(event.pointerId);
                  drawingRef.current = true;
                  pointerRef.current = event.pointerId;
                  const rect = canvas.getBoundingClientRect();
                  const point = { x: (event.clientX - rect.left) * (canvas.width / Math.max(1, rect.width)), y: (event.clientY - rect.top) * (canvas.height / Math.max(1, rect.height)) };
                  pointRef.current = point;
                  drawHardStroke(point, { x: point.x + 0.01, y: point.y + 0.01 });
                  event.preventDefault();
                }}
                onPointerMove={(event) => {
                  if (!drawingRef.current || pointerRef.current !== event.pointerId) return;
                  const canvas = whiteboardRef.current;
                  const prev = pointRef.current;
                  if (!canvas || !prev) return;
                  const next = toCanvasPoint(canvas, event);
                  drawHardStroke(prev, next);
                  pointRef.current = next;
                  event.preventDefault();
                }}
                onPointerUp={(event) => {
                  if (pointerRef.current !== event.pointerId) return;
                  const canvas = whiteboardRef.current;
                  if (canvas && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
                  drawingRef.current = false;
                  pointerRef.current = null;
                  pointRef.current = null;
                  const c = whiteboardRef.current;
                  if (c) localStorage.setItem(WHITEBOARD_KEY, c.toDataURL('image/png'));
                }}
                onPointerCancel={(event) => {
                  if (pointerRef.current !== event.pointerId) return;
                  const canvas = whiteboardRef.current;
                  if (canvas && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
                  drawingRef.current = false;
                  pointerRef.current = null;
                  pointRef.current = null;
                  const c = whiteboardRef.current;
                  if (c) localStorage.setItem(WHITEBOARD_KEY, c.toDataURL('image/png'));
                }}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
