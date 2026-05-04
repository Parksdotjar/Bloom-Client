import { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Pause, Play, RefreshCcw } from 'lucide-react';

type Cell = string | null;
type PieceId = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
type Piece = { id: PieceId; x: number; y: number; rotation: number };
type Status = 'idle' | 'running' | 'paused' | 'over';

const W = 10;
const H = 12;
const TETRIS_BEST_KEY = 'bloom_games_tetris_best_score';
const PIECES: Record<PieceId, { color: string; shape: number[][] }> = {
  I: { color: '#67e8f9', shape: [[1, 1, 1, 1]] },
  O: { color: '#facc15', shape: [[1, 1], [1, 1]] },
  T: { color: '#c084fc', shape: [[0, 1, 0], [1, 1, 1]] },
  S: { color: '#4ade80', shape: [[0, 1, 1], [1, 1, 0]] },
  Z: { color: '#fb7185', shape: [[1, 1, 0], [0, 1, 1]] },
  J: { color: '#60a5fa', shape: [[1, 0, 0], [1, 1, 1]] },
  L: { color: '#fb923c', shape: [[0, 0, 1], [1, 1, 1]] }
};
const IDS = Object.keys(PIECES) as PieceId[];

function emptyBoard(): Cell[][] {
  return Array.from({ length: H }, () => Array<Cell>(W).fill(null));
}

function rotate(shape: number[][]) {
  return shape[0].map((_, x) => shape.map((row) => row[x]).reverse());
}

function shapeOf(piece: Piece) {
  let shape = PIECES[piece.id].shape;
  for (let i = 0; i < piece.rotation % 4; i += 1) shape = rotate(shape);
  return shape;
}

function randomPiece(exclude?: PieceId): PieceId {
  const pool = exclude ? IDS.filter((id) => id !== exclude) : IDS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function createQueue(after: PieceId, length = 3): PieceId[] {
  const queue: PieceId[] = [];
  let previous = after;
  for (let i = 0; i < length; i += 1) {
    const next = randomPiece(previous);
    queue.push(next);
    previous = next;
  }
  return queue;
}

function createPiece(id: PieceId): Piece {
  const width = PIECES[id].shape[0].length;
  return { id, x: Math.floor((W - width) / 2), y: -1, rotation: 0 };
}

function collides(board: Cell[][], piece: Piece) {
  const shape = shapeOf(piece);
  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (!shape[y][x]) continue;
      const bx = piece.x + x;
      const by = piece.y + y;
      if (bx < 0 || bx >= W || by >= H) return true;
      if (by >= 0 && board[by][bx]) return true;
    }
  }
  return false;
}

function merge(board: Cell[][], piece: Piece) {
  const next = board.map((row) => [...row]);
  const shape = shapeOf(piece);
  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (!shape[y][x]) continue;
      const by = piece.y + y;
      const bx = piece.x + x;
      if (by >= 0 && by < H && bx >= 0 && bx < W) next[by][bx] = PIECES[piece.id].color;
    }
  }
  return next;
}

function clearLines(board: Cell[][]) {
  const kept = board.filter((row) => row.some((cell) => !cell));
  const cleared = H - kept.length;
  return {
    board: [...Array.from({ length: cleared }, () => Array<Cell>(W).fill(null)), ...kept],
    cleared
  };
}

function ghostPiece(board: Cell[][], piece: Piece) {
  let ghost = { ...piece };
  while (!collides(board, { ...ghost, y: ghost.y + 1 })) ghost = { ...ghost, y: ghost.y + 1 };
  return ghost;
}

function scoreFor(lines: number, level: number) {
  return [0, 100, 300, 500, 800][lines] * level;
}

export function TetrisGame() {
  const firstPiece = useMemo(() => randomPiece(), []);
  const [board, setBoard] = useState<Cell[][]>(() => emptyBoard());
  const [current, setCurrent] = useState<Piece>(() => createPiece(firstPiece));
  const [nextQueue, setNextQueue] = useState<PieceId[]>(() => createQueue(firstPiece));
  const [hold, setHold] = useState<PieceId | null>(null);
  const [holdUsed, setHoldUsed] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [best, setBest] = useState(() => {
    const stored = Number(localStorage.getItem(TETRIS_BEST_KEY));
    return Number.isFinite(stored) ? stored : 0;
  });

  const level = Math.floor(lines / 10) + 1;
  const fallMs = Math.max(55, 430 - (level - 1) * 36);

  const spawnNext = useCallback((lockedBoard: Cell[][]) => {
    const [id, ...rest] = nextQueue;
    const piece = createPiece(id);
    const previous = rest[rest.length - 1] ?? id;
    const queue = [...rest, randomPiece(previous)];
    setNextQueue(queue);
    setCurrent(piece);
    setHoldUsed(false);
    if (collides(lockedBoard, piece)) {
      setStatus('over');
      setBest((currentBest) => {
        const nextBest = Math.max(currentBest, score);
        localStorage.setItem(TETRIS_BEST_KEY, String(nextBest));
        return nextBest;
      });
    }
  }, [nextQueue, score]);

  const lockPiece = useCallback((piece: Piece) => {
    const locked = merge(board, piece);
    const result = clearLines(locked);
    setBoard(result.board);
    if (result.cleared > 0) {
      setLines((value) => value + result.cleared);
      setScore((value) => value + scoreFor(result.cleared, level));
    }
    spawnNext(result.board);
  }, [board, level, spawnNext]);

  const move = useCallback((dx: number, dy: number) => {
    if (status !== 'running') return false;
    const next = { ...current, x: current.x + dx, y: current.y + dy };
    if (collides(board, next)) return false;
    setCurrent(next);
    return true;
  }, [board, current, status]);

  const hardDrop = useCallback(() => {
    if (status !== 'running') return;
    const ghost = ghostPiece(board, current);
    setScore((value) => value + Math.max(0, ghost.y - current.y) * 2);
    lockPiece(ghost);
  }, [board, current, lockPiece, status]);

  const rotateCurrent = useCallback(() => {
    if (status !== 'running') return;
    const rotated = { ...current, rotation: current.rotation + 1 };
    const kicks = [0, -1, 1, -2, 2];
    for (const kick of kicks) {
      const candidate = { ...rotated, x: rotated.x + kick };
      if (!collides(board, candidate)) {
        setCurrent(candidate);
        return;
      }
    }
  }, [board, current, status]);

  const holdPiece = useCallback(() => {
    if (status !== 'running' || holdUsed) return;
    if (hold) {
      setHold(current.id);
      setCurrent(createPiece(hold));
    } else {
      setHold(current.id);
      spawnNext(board);
    }
    setHoldUsed(true);
  }, [board, current.id, hold, holdUsed, spawnNext, status]);

  const tick = useCallback(() => {
    if (!move(0, 1) && status === 'running') lockPiece(current);
  }, [current, lockPiece, move, status]);

  const start = () => {
    const id = randomPiece();
    setBoard(emptyBoard());
    setCurrent(createPiece(id));
    setNextQueue(createQueue(id));
    setHold(null);
    setHoldUsed(false);
    setScore(0);
    setLines(0);
    setStatus('running');
  };

  useEffect(() => {
    if (status !== 'running') return;
    const timer = window.setInterval(tick, fallMs);
    return () => window.clearInterval(timer);
  }, [fallMs, status, tick]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat && event.key === ' ') return;
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') { event.preventDefault(); move(-1, 0); }
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') { event.preventDefault(); move(1, 0); }
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') { event.preventDefault(); if (move(0, 1)) setScore((value) => value + 1); }
      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') { event.preventDefault(); rotateCurrent(); }
      if (event.key === ' ') { event.preventDefault(); hardDrop(); }
      if (event.key.toLowerCase() === 'c') { event.preventDefault(); holdPiece(); }
      if (event.key.toLowerCase() === 'p') { event.preventDefault(); setStatus((value) => value === 'running' ? 'paused' : value === 'paused' ? 'running' : value); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hardDrop, holdPiece, move, rotateCurrent]);

  const displayBoard = useMemo(() => {
    const next = board.map((row) => [...row]);
    if (status !== 'over') {
      const ghost = ghostPiece(board, current);
      const ghostShape = shapeOf(ghost);
      for (let y = 0; y < ghostShape.length; y += 1) {
        for (let x = 0; x < ghostShape[y].length; x += 1) {
          const by = ghost.y + y;
          const bx = ghost.x + x;
          if (ghostShape[y][x] && by >= 0 && by < H && bx >= 0 && bx < W && !next[by][bx]) next[by][bx] = 'rgba(255,255,255,0.12)';
        }
      }

      const currentShape = shapeOf(current);
      for (let y = 0; y < currentShape.length; y += 1) {
        for (let x = 0; x < currentShape[y].length; x += 1) {
          const by = current.y + y;
          const bx = current.x + x;
          if (currentShape[y][x] && by >= 0 && by < H && bx >= 0 && bx < W) next[by][bx] = PIECES[current.id].color;
        }
      }
    }
    return next;
  }, [board, current, status]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,520px)_minmax(320px,1fr)]">
      <section className="g-panel p-4">
        <div className="mx-auto grid w-full max-w-[420px] grid-cols-10 gap-1 rounded-2xl border border-white/10 bg-[#07090d] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
          {displayBoard.flatMap((row, y) => row.map((cell, x) => (
            <div
              key={`${x}-${y}`}
              className="aspect-square rounded-[4px] border border-white/[0.04]"
              style={{
                background: cell || 'linear-gradient(180deg,#11151c,#0b0e13)',
                boxShadow: cell ? `inset 0 1px 0 rgba(255,255,255,0.35), 0 0 14px ${cell}` : 'none'
              }}
            />
          )))}
        </div>
      </section>

      <aside className="space-y-3">
        <section className="g-panel p-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Score" value={score} />
            <Stat label="Best" value={best} />
            <Stat label="Level" value={level} />
            <Stat label="Lines" value={lines} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={start} className="g-btn-accent h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-2"><Play size={13} />Start</button>
            <button onClick={() => setStatus((value) => value === 'running' ? 'paused' : value === 'paused' ? 'running' : value)} disabled={status === 'idle' || status === 'over'} className="g-btn h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-2 disabled:opacity-45"><Pause size={13} />{status === 'paused' ? 'Resume' : 'Pause'}</button>
            <button onClick={start} className="g-btn h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-2"><RefreshCcw size={13} />Reset</button>
          </div>
          <p className="mt-3 text-xs font-bold text-white/55">{status === 'over' ? 'Top out. Start again.' : status === 'paused' ? 'Paused.' : status === 'running' ? 'Running.' : 'Ready.'}</p>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <Preview title="Hold" id={hold} muted={!hold || holdUsed} />
          <Preview title="Next" id={nextQueue[0]} />
        </section>

        <section className="g-panel p-4">
          <p className="text-sm font-extrabold text-white">Controls</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-white/58">
            <p>Move: Arrows / WASD</p>
            <p>Rotate: Up / W</p>
            <p>Soft drop: Down / S</p>
            <p>Hard drop: Space</p>
            <p>Hold: C</p>
            <p>Pause: P</p>
          </div>
        </section>
      </aside>
    </div>
  );
}

function Preview({ title, id, muted = false }: { title: string; id: PieceId | null; muted?: boolean }) {
  const shape = id ? PIECES[id].shape : [];
  return (
    <div className={clsx('g-panel p-4', muted && 'opacity-55')}>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/45">{title}</p>
      <div className="mt-3 grid h-24 w-24 grid-cols-4 grid-rows-4 gap-1">
        {Array.from({ length: 16 }, (_, index) => {
          const x = index % 4;
          const y = Math.floor(index / 4);
          const filled = id && shape[y]?.[x];
          return <div key={index} className="rounded-[4px] border border-white/[0.04]" style={{ background: filled && id ? PIECES[id].color : 'rgba(255,255,255,0.03)' }} />;
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/45">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-white">{value}</p>
    </div>
  );
}
