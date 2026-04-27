import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Terminal, X } from 'lucide-react';
import {
  CONSOLE_SETTINGS_CHANGE_EVENT,
  CONSOLE_PERSIST_HISTORY_KEY,
  CONSOLE_SHOW_STARTUP_TIP_KEY
} from '../constants/console';
import { executeConsoleInput } from '../console/executor';
import { buildConsoleSuggestions } from '../console/suggestions';
import { useBloomConsoleStore } from '../console/store';
import type { ConsoleCommandContext, ConsoleCommandDefinition, ConsoleSuggestion } from '../console/types';

type Props = {
  open: boolean;
  hotkeyLabel: string;
  commands: ConsoleCommandDefinition[];
  context: ConsoleCommandContext;
  onClose: () => void;
};

function readBoolean(key: string, fallback: boolean) {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw !== 'false';
}

function quoteIfNeeded(value: string) {
  return /\s/.test(value) ? `"${value}"` : value;
}

function kindClass(kind: 'command' | 'info' | 'success' | 'warn' | 'error') {
  switch (kind) {
    case 'command':
      return 'text-[var(--g-accent)]';
    case 'success':
      return 'text-emerald-200';
    case 'warn':
      return 'text-amber-200';
    case 'error':
      return 'text-red-300';
    default:
      return 'text-white/78';
  }
}

export function BloomConsole({ open, hotkeyLabel, commands, context, onClose }: Props) {
  const [persistHistory, setPersistHistory] = useState<boolean>(() => readBoolean(CONSOLE_PERSIST_HISTORY_KEY, true));
  const [showStartupTip, setShowStartupTip] = useState<boolean>(() => readBoolean(CONSOLE_SHOW_STARTUP_TIP_KEY, true));
  const [input, setInput] = useState('');
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [historyDraft, setHistoryDraft] = useState('');
  const [suggestions, setSuggestions] = useState<ConsoleSuggestion[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);

  const tipShownRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const commandsRef = useRef(commands);
  const contextRef = useRef(context);

  const store = useBloomConsoleStore(persistHistory);

  useEffect(() => {
    commandsRef.current = commands;
  }, [commands]);

  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  useEffect(() => {
    store.setPersistedHistory(persistHistory);
  }, [persistHistory, store]);

  useEffect(() => {
    const onSettingsChange = () => {
      setPersistHistory(readBoolean(CONSOLE_PERSIST_HISTORY_KEY, true));
      setShowStartupTip(readBoolean(CONSOLE_SHOW_STARTUP_TIP_KEY, true));
    };
    window.addEventListener(CONSOLE_SETTINGS_CHANGE_EVENT, onSettingsChange as EventListener);
    return () => window.removeEventListener(CONSOLE_SETTINGS_CHANGE_EVENT, onSettingsChange as EventListener);
  }, []);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 0);
    if (showStartupTip && !tipShownRef.current) {
      tipShownRef.current = true;
      store.pushLines('info', [
        'Bloom Console ready.',
        'Type `help` for commands, `Tab` to autocomplete, and `Esc` to close.'
      ]);
    }
  }, [open, showStartupTip, store]);

  useEffect(() => {
    if (!open || !outputRef.current) return;
    outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [open, store.entries]);

  useEffect(() => {
    if (!open) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    void buildConsoleSuggestions(input, commandsRef.current, contextRef.current).then((next) => {
      if (cancelled) return;
      setSuggestions(next);
      setSuggestionIndex(0);
    });
    return () => {
      cancelled = true;
    };
  }, [input, open]);

  const activeSuggestion = suggestions[suggestionIndex] ?? suggestions[0] ?? null;

  const applySuggestion = useCallback((suggestion: ConsoleSuggestion) => {
    if (suggestion.description.startsWith('Argument for')) {
      const next = `${input}${input.endsWith(' ') || input.length === 0 ? '' : ' '}${quoteIfNeeded(suggestion.value)} `;
      setInput(next);
      return;
    }
    setInput(`${suggestion.value} `);
  }, [input]);

  const runInput = useCallback(async () => {
    const source = input.trim();
    if (!source) return;

    setInput('');
    setHistoryCursor(null);
    setHistoryDraft('');
    store.pushEntry('command', `> ${source}`);
    store.pushHistory(source);

    const execution = await executeConsoleInput(source, commandsRef.current, contextRef.current);
    if (!execution.ok) {
      store.pushLines('error', [execution.message]);
      if (execution.usage) {
        store.pushLines('info', [execution.usage]);
      }
      return;
    }

    if (execution.result.clearOutput) {
      store.clearEntries();
      return;
    }
    if (execution.result.lines && execution.result.lines.length > 0) {
      store.pushLines(execution.result.kind ?? 'info', execution.result.lines);
    }
  }, [input, store]);

  const onInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === 'Tab') {
      if (suggestions.length === 0) return;
      event.preventDefault();
      applySuggestion(suggestions[suggestionIndex] ?? suggestions[0]);
      return;
    }

    if (event.key === 'ArrowUp') {
      if (store.history.length === 0) return;
      event.preventDefault();
      if (historyCursor === null) {
        setHistoryDraft(input);
        const nextIndex = store.history.length - 1;
        setHistoryCursor(nextIndex);
        setInput(store.history[nextIndex] ?? '');
        return;
      }
      const nextIndex = Math.max(0, historyCursor - 1);
      setHistoryCursor(nextIndex);
      setInput(store.history[nextIndex] ?? '');
      return;
    }

    if (event.key === 'ArrowDown') {
      if (historyCursor === null) return;
      event.preventDefault();
      const nextIndex = historyCursor + 1;
      if (nextIndex >= store.history.length) {
        setHistoryCursor(null);
        setInput(historyDraft);
        return;
      }
      setHistoryCursor(nextIndex);
      setInput(store.history[nextIndex] ?? '');
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      void runInput();
    }
  }, [applySuggestion, historyCursor, historyDraft, input, onClose, runInput, store.history, suggestionIndex, suggestions]);

  const lineCount = useMemo(() => store.entries.length, [store.entries.length]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-[320] app-region-no-drag">
      <div
        className="absolute inset-0 bg-black/52 backdrop-blur-[2px]"
        onMouseDown={onClose}
      />
      <div className="relative mx-auto flex h-full w-full max-w-[1220px] flex-col px-3 pb-3 pt-14 md:px-5 md:pt-20">
        <section
          className="g-panel-strong flex min-h-0 flex-1 flex-col overflow-hidden border-white/12"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-white/[0.05] text-white/80">
                <Terminal size={14} />
              </span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] g-accent-text">Bloom Console</p>
                <p className="text-xs text-white/55">Power-user command runtime</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg border border-white/12 bg-white/[0.03] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/58">
                {hotkeyLabel}
              </span>
              <button
                onClick={onClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-white/[0.03] text-white/65 transition hover:bg-white/[0.08]"
                aria-label="Close Bloom Console"
              >
                <X size={14} />
              </button>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[1fr_260px]">
            <div className="flex min-h-0 flex-col border-r border-white/10">
              <div ref={outputRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <div className="space-y-1.5 font-mono text-[12px] leading-6">
                  {store.entries.map((entry) => (
                    <p key={entry.id} className={kindClass(entry.kind)}>
                      {entry.text}
                    </p>
                  ))}
                  {store.entries.length === 0 && (
                    <p className="text-white/42">No output yet. Run `help` to start.</p>
                  )}
                </div>
              </div>
              <div className="border-t border-white/10 px-4 py-3">
                <div className="flex items-center gap-2 rounded-xl border border-white/12 bg-black/25 px-3">
                  <span className="text-sm font-black g-accent-text">{'>'}</span>
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={onInputKeyDown}
                    placeholder="Enter a Bloom command"
                    className="h-11 w-full bg-transparent font-mono text-[13px] text-white outline-none placeholder:text-white/35"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                </div>
                {activeSuggestion && (
                  <p className="mt-1.5 text-[11px] text-white/45">
                    Suggestion: <span className="text-white/72">{activeSuggestion.value}</span>
                  </p>
                )}
              </div>
            </div>

            <aside className="hidden min-h-0 flex-col md:flex">
              <div className="border-b border-white/10 px-3 py-2">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/58">Suggestions</p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {suggestions.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-white/45">No suggestions</p>
                ) : (
                  <div className="space-y-1">
                    {suggestions.map((suggestion, index) => (
                      <button
                        key={`${suggestion.value}-${index}`}
                        onClick={() => applySuggestion(suggestion)}
                        onMouseEnter={() => setSuggestionIndex(index)}
                        className={`w-full rounded-lg border px-2 py-2 text-left transition ${
                          index === suggestionIndex
                            ? 'border-[var(--g-accent)]/40 bg-[var(--g-accent-soft)] text-white'
                            : 'border-transparent bg-white/[0.02] text-white/75 hover:border-white/15 hover:bg-white/[0.06]'
                        }`}
                      >
                        <p className="font-mono text-[12px]">{suggestion.value}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-white/45">
                          {suggestion.category}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-white/10 px-3 py-2 text-[10px] text-white/45">
                {lineCount} line{lineCount === 1 ? '' : 's'}
              </div>
            </aside>
          </div>
        </section>
      </div>
    </div>
  );
}
