import { useEffect, useMemo, useState } from 'react';
import { Award, CalendarClock, ChevronRight, Gift, Sparkles, Trophy } from 'lucide-react';
import {
  claimDailyLoginReward,
  loadRewardHistory,
  loadRewardSnapshot,
  updateRewardResetSettings,
  type RewardHistory,
  type RewardSnapshot
} from '../../services/account';

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Australia/Sydney'
];

function xpBounds(level: number) {
  const safeLevel = Math.max(1, level);
  const current = Math.pow(safeLevel - 1, 2) * 100;
  const next = Math.pow(safeLevel, 2) * 100;
  return { current, next };
}

function formatTimeLeft(targetIso?: string) {
  if (!targetIso) return '--';
  const diff = Math.max(0, new Date(targetIso).getTime() - Date.now());
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatDate(value?: string | null) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatResetTime(value?: string | null) {
  return (value || '00:00').slice(0, 5);
}

function formatErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) return maybeMessage;
    try {
      return JSON.stringify(error);
    } catch {
      return 'Something went wrong.';
    }
  }
  return String(error || 'Something went wrong.');
}

export function RewardsPanel() {
  const [snapshot, setSnapshot] = useState<RewardSnapshot | null>(null);
  const [history, setHistory] = useState<RewardHistory>({ claims: [], milestones: [], capeCodes: [] });
  const [resetTime, setResetTime] = useState('00:00');
  const [timezone, setTimezone] = useState('UTC');
  const [timeLeft, setTimeLeft] = useState('--');
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [savingReset, setSavingReset] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const profile = snapshot?.profile;
  const bounds = xpBounds(profile?.level ?? 1);
  const xpIntoLevel = Math.max(0, (profile?.xp ?? 0) - bounds.current);
  const xpNeeded = Math.max(1, bounds.next - bounds.current);
  const xpProgress = Math.min(100, Math.round((xpIntoLevel / xpNeeded) * 100));
  const resetLockedUntil = profile?.reset_change_locked_until ? new Date(profile.reset_change_locked_until) : null;
  const resetLocked = Boolean(resetLockedUntil && resetLockedUntil.getTime() > Date.now());

  const mergedHistory = useMemo(() => {
    const claims = history.claims.map((claim) => ({
      id: `claim-${claim.id}`,
      date: claim.claimed_at,
      title: `Daily login`,
      detail: `Streak ${claim.streak_after_claim} · +${claim.xp_awarded} XP`
    }));
    const milestones = history.milestones.map((milestone) => ({
      id: `milestone-${milestone.id}`,
      date: milestone.awarded_at,
      title: `${milestone.milestone_days}-day streak`,
      detail: `${milestone.cape_codes_awarded} static cape code${milestone.cape_codes_awarded === 1 ? '' : 's'}`
    }));
    return [...claims, ...milestones]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 6);
  }, [history]);

  const refresh = async () => {
    const [nextSnapshot, nextHistory] = await Promise.all([
      loadRewardSnapshot(),
      loadRewardHistory()
    ]);
    setSnapshot(nextSnapshot);
    setHistory(nextHistory);
    setResetTime(formatResetTime(nextSnapshot.profile.reset_time_local));
    setTimezone(nextSnapshot.profile.timezone || 'UTC');
    setTimeLeft(formatTimeLeft(nextSnapshot.current_window_end));
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [nextSnapshot, nextHistory] = await Promise.all([
          loadRewardSnapshot(),
          loadRewardHistory()
        ]);
        if (cancelled) return;
        setSnapshot(nextSnapshot);
        setHistory(nextHistory);
        setResetTime(formatResetTime(nextSnapshot.profile.reset_time_local));
        setTimezone(nextSnapshot.profile.timezone || 'UTC');
        setTimeLeft(formatTimeLeft(nextSnapshot.current_window_end));
      } catch (err) {
        if (!cancelled) setError(formatErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTimeLeft(formatTimeLeft(snapshot?.current_window_end));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [snapshot?.current_window_end]);

  const handleClaim = async () => {
    setClaiming(true);
    setError(null);
    setMessage(null);
    try {
      const nextSnapshot = await claimDailyLoginReward();
      setSnapshot(nextSnapshot);
      await refresh();
      if (nextSnapshot.claimed) {
        const capeText = nextSnapshot.cape_codes_awarded ? ` · ${nextSnapshot.cape_codes_awarded} cape code${nextSnapshot.cape_codes_awarded === 1 ? '' : 's'}` : '';
        setMessage(`Claimed +${nextSnapshot.xp_awarded ?? 0} XP${capeText}`);
      } else {
        setMessage('Already claimed for this reset window.');
      }
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setClaiming(false);
    }
  };

  const handleSaveReset = async () => {
    setSavingReset(true);
    setError(null);
    setMessage(null);
    try {
      const nextSnapshot = await updateRewardResetSettings(resetTime, timezone);
      setSnapshot(nextSnapshot);
      setMessage('Daily reset updated.');
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setSavingReset(false);
    }
  };

  return (
    <section className="mt-10 rounded-[30px] border border-[#303035] bg-black/48 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.52)] backdrop-blur-2xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.28em] text-pink-100/60">Rewards</p>
          <h2 className="mt-2 text-3xl font-black text-white">Daily Bloom</h2>
          <p className="mt-2 max-w-xl text-sm font-semibold text-white/52">Claim once per reset window. Server time decides every reward.</p>
        </div>
        <button
          onClick={handleClaim}
          disabled={claiming || loading || !snapshot?.can_claim}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-pink-200/24 bg-pink-200/12 px-6 text-xs font-extrabold uppercase tracking-[0.16em] text-pink-50 transition hover:border-pink-100/45 hover:bg-pink-200/18 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Sparkles size={16} />
          {snapshot?.can_claim ? 'Claim Daily' : 'Claimed'}
        </button>
      </div>

      {(message || error) && (
        <p className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-bold ${error ? 'border-pink-300/20 bg-pink-500/10 text-pink-100' : 'border-emerald-300/18 bg-emerald-400/8 text-emerald-100'}`}>
          {error || message}
        </p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-4">
        <div className="rounded-[24px] border border-[#303035] bg-white/[0.025] p-5">
          <Award className="text-pink-100/75" size={20} />
          <p className="mt-6 text-[10px] font-extrabold uppercase tracking-[0.22em] text-white/38">Level</p>
          <p className="mt-2 text-4xl font-black text-white">{profile?.level ?? 1}</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/8">
            <div className="h-full rounded-full bg-gradient-to-r from-pink-300 to-cyan-100" style={{ width: `${xpProgress}%` }} />
          </div>
          <p className="mt-2 text-xs font-semibold text-white/45">{profile?.xp ?? 0} XP</p>
        </div>
        <div className="rounded-[24px] border border-[#303035] bg-white/[0.025] p-5">
          <Trophy className="text-cyan-100/75" size={20} />
          <p className="mt-6 text-[10px] font-extrabold uppercase tracking-[0.22em] text-white/38">Current Streak</p>
          <p className="mt-2 text-4xl font-black text-white">{profile?.current_streak ?? 0}</p>
          <p className="mt-2 text-xs font-semibold text-white/45">Best {profile?.longest_streak ?? 0} days</p>
        </div>
        <div className="rounded-[24px] border border-[#303035] bg-white/[0.025] p-5">
          <CalendarClock className="text-white/65" size={20} />
          <p className="mt-6 text-[10px] font-extrabold uppercase tracking-[0.22em] text-white/38">Next Claim</p>
          <p className="mt-2 text-3xl font-black text-white">{snapshot?.can_claim ? 'Ready' : timeLeft}</p>
          <p className="mt-2 text-xs font-semibold text-white/45">{formatResetTime(profile?.reset_time_local)} · {profile?.timezone ?? 'UTC'}</p>
        </div>
        <div className="rounded-[24px] border border-[#303035] bg-white/[0.025] p-5">
          <Gift className="text-pink-100/75" size={20} />
          <p className="mt-6 text-[10px] font-extrabold uppercase tracking-[0.22em] text-white/38">Next Milestone</p>
          <p className="mt-2 text-3xl font-black text-white">{snapshot?.next_milestone_days ?? 30} days</p>
          <p className="mt-2 text-xs font-semibold text-white/45">{snapshot?.next_milestone_codes ?? 1} static cape code{snapshot?.next_milestone_codes === 1 ? '' : 's'}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="rounded-[24px] border border-[#303035] bg-white/[0.018] p-5">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-white/40">Reset Window</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[160px_1fr_auto]">
            <input
              value={resetTime}
              onChange={(event) => setResetTime(event.target.value)}
              disabled={resetLocked}
              type="time"
              className="h-12 rounded-2xl border border-[#33333a] bg-black/35 px-4 text-sm font-bold text-white outline-none disabled:opacity-45"
            />
            <select
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              disabled={resetLocked}
              className="h-12 rounded-2xl border border-[#33333a] bg-black/35 px-4 text-sm font-bold text-white outline-none disabled:opacity-45"
            >
              {TIMEZONES.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
            </select>
            <button
              onClick={handleSaveReset}
              disabled={savingReset || resetLocked}
              className="h-12 rounded-2xl border border-[#3d3d45] bg-white/[0.045] px-5 text-xs font-extrabold uppercase tracking-[0.14em] text-white/75 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Save
            </button>
          </div>
          <p className="mt-3 text-xs font-semibold text-white/42">
            {resetLocked
              ? `Reset changes unlock ${formatDate(profile?.reset_change_locked_until)}.`
              : 'Changing this locks reset settings for 30 days.'}
          </p>
        </div>

        <div className="rounded-[24px] border border-[#303035] bg-white/[0.018] p-5">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-white/40">Recent Rewards</p>
          <div className="mt-4 space-y-2">
            {mergedHistory.length ? mergedHistory.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-4 rounded-2xl border border-[#2b2b31] bg-black/26 px-4 py-3">
                <div>
                  <p className="text-sm font-extrabold text-white">{item.title}</p>
                  <p className="mt-1 text-xs font-semibold text-white/42">{item.detail}</p>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-white/38">
                  {formatDate(item.date)}
                  <ChevronRight size={14} />
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-[#2b2b31] bg-black/26 px-4 py-6 text-sm font-semibold text-white/42">
                No reward history yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
