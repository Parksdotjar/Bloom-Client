import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Bot, ChevronUp, LoaderCircle, Send, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { getBudResponse, type BudContext } from '../services/bud';

type BudMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  title?: string;
  actions?: { label: string; route?: string; note?: string }[];
};

type BudAssistantProps = {
  enabled: boolean;
  onNavigate: (route: string) => void;
  context: BudContext;
};

const WELCOME_MESSAGE: BudMessage = {
  id: 'welcome',
  role: 'assistant',
  title: 'BUD',
  text: 'Hi, I am BUD. Ask me launcher questions like how to install modpacks, where a setting lives, or why a Fabric install failed.',
  actions: [
    { label: 'Open Marketplace', route: '/marketplace' },
    { label: 'Open Help', route: '/help' }
  ]
};

export function BudAssistant({ enabled, onNavigate, context }: BudAssistantProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<BudMessage[]>([WELCOME_MESSAGE]);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading, open]);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  if (!enabled) return null;

  const submit = () => {
    const question = input.trim();
    if (!question || loading) return;

    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: 'user', text: question }
    ]);
    setInput('');
    setLoading(true);

    window.setTimeout(() => {
      const response = getBudResponse(question, context);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          title: response.title,
          text: response.body,
          actions: response.actions
        }
      ]);
      setLoading(false);
    }, 520);
  };

  return (
    <div className="fixed bottom-5 right-5 z-[220] app-region-no-drag">
      {open ? (
        <div className="w-[360px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0f]/95 shadow-[0_20px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.04))] text-white">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-extrabold tracking-[0.12em] text-white">BUD</p>
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Bloom Assistant</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
              aria-label="Collapse BUD assistant"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          </div>

          <div ref={listRef} className="max-h-[380px] space-y-3 overflow-auto px-4 py-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={clsx(
                  'rounded-2xl border px-3 py-3',
                  message.role === 'assistant'
                    ? 'border-white/10 bg-white/[0.035] text-white'
                    : 'ml-10 border-white/10 text-white'
                )}
                style={message.role === 'user' ? { backgroundColor: 'var(--g-accent-soft)' } : undefined}
              >
                {message.title ? (
                  <div className="mb-1 flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-[var(--g-accent)]" />
                    <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-white/75">{message.title}</p>
                  </div>
                ) : null}
                <p className="text-sm leading-6 text-white/90">{message.text}</p>
                {message.actions?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {message.actions.map((action) => (
                      <button
                        key={`${message.id}-${action.label}`}
                        type="button"
                        onClick={() => {
                          if (action.route) onNavigate(action.route);
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/80 transition hover:bg-white/[0.08] hover:text-white"
                      >
                        {action.label}
                        {action.route ? <ArrowUpRight className="h-3 w-3" /> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}

            {loading ? (
              <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-3 text-white/75">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                <div className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/70" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/55 [animation-delay:120ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/40 [animation-delay:240ms]" />
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-white/10 p-3">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    submit();
                  }
                }}
                placeholder="Ask BUD a Bloom question..."
                className="h-10 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
              />
              <button
                type="button"
                disabled={!canSend}
                onClick={submit}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--g-accent)] text-black transition disabled:cursor-not-allowed disabled:opacity-45"
                aria-label="Send message to BUD"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-[#0b0b0f]/90 text-white shadow-[0_14px_45px_rgba(0,0,0,0.45)] backdrop-blur-xl transition hover:scale-[1.03]"
          aria-label="Open BUD assistant"
        >
          <ArrowUpRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
