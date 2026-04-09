import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, LoaderCircle, Lock, ShieldCheck, Wallet } from 'lucide-react';
import { clsx } from 'clsx';
import {
  LEGAL_DOCUMENT_ORDER,
  loadLegalDocuments,
  saveLegalDocument,
  subscribeLegalDocuments,
  type LegalDocumentRecord,
  type LegalDocumentSlug
} from '../services/legal';
import { isCurrentUserOwner } from '../services/cosmetics';

type DraftState = Record<LegalDocumentSlug, Pick<LegalDocumentRecord, 'title' | 'summary' | 'content'>>;

const NAV_ITEMS: Array<{ slug: LegalDocumentSlug; label: string; icon: typeof FileText }> = [
  { slug: 'tos', label: 'TOS', icon: FileText },
  { slug: 'privacy-policy', label: 'Privacy Policy', icon: ShieldCheck },
  { slug: 'payment-policy', label: 'Payment Policy', icon: Wallet }
];

const EMPTY_DRAFTS: DraftState = {
  tos: { title: '', summary: '', content: '' },
  'privacy-policy': { title: '', summary: '', content: '' },
  'payment-policy': { title: '', summary: '', content: '' }
};

function buildDraftState(documents: LegalDocumentRecord[]): DraftState {
  const next: DraftState = {
    tos: { ...EMPTY_DRAFTS.tos },
    'privacy-policy': { ...EMPTY_DRAFTS['privacy-policy'] },
    'payment-policy': { ...EMPTY_DRAFTS['payment-policy'] }
  };
  for (const slug of LEGAL_DOCUMENT_ORDER) {
    const document = documents.find((entry) => entry.slug === slug);
    if (!document) continue;
    next[slug] = {
      title: document.title,
      summary: document.summary,
      content: document.content
    };
  }
  return next;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function toErrorMessage(value: unknown) {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'message' in value && typeof value.message === 'string') {
    return value.message;
  }
  return 'An unexpected error occurred.';
}

export function Information() {
  const [documents, setDocuments] = useState<LegalDocumentRecord[]>([]);
  const [drafts, setDrafts] = useState<DraftState>(EMPTY_DRAFTS);
  const [activeSlug, setActiveSlug] = useState<LegalDocumentSlug>('tos');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [savingSlug, setSavingSlug] = useState<LegalDocumentSlug | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      try {
        const [docs, owner] = await Promise.all([loadLegalDocuments(), isCurrentUserOwner().catch(() => false)]);
        if (!active) return;
        setDocuments(docs);
        setDrafts(buildDraftState(docs));
        setIsOwner(owner);
        setError(null);
      } catch (loadError) {
        if (!active) return;
        setError(toErrorMessage(loadError));
      } finally {
        if (active) setLoading(false);
      }
    };

    void refresh();
    const unsubscribe = subscribeLegalDocuments(() => {
      void refresh();
    });

    return () => {
      active = false;
      unsubscribe();
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  const activeDocument = useMemo(() => {
    return documents.find((entry) => entry.slug === activeSlug) ?? null;
  }, [activeSlug, documents]);

  const activeDraft = drafts[activeSlug];

  useEffect(() => {
    if (!isOwner || !editMode || !activeDocument) return;
    if (
      activeDraft.title === activeDocument.title &&
      activeDraft.summary === activeDocument.summary &&
      activeDraft.content === activeDocument.content
    ) {
      return;
    }

    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      setSavingSlug(activeSlug);
      void saveLegalDocument(activeSlug, activeDraft)
        .then((saved) => {
          setDocuments((current) => {
            const next = current.filter((entry) => entry.slug !== saved.slug);
            next.push(saved);
            next.sort((a, b) => LEGAL_DOCUMENT_ORDER.indexOf(a.slug) - LEGAL_DOCUMENT_ORDER.indexOf(b.slug));
            return next;
          });
          setError(null);
        })
        .catch((saveError) => {
          setError(toErrorMessage(saveError));
        })
        .finally(() => {
          setSavingSlug((current) => (current === activeSlug ? null : current));
        });
    }, 900);
  }, [activeDocument, activeDraft, activeSlug, editMode, isOwner]);

  const updateDraft = (field: 'title' | 'summary' | 'content', value: string) => {
    setDrafts((current) => ({
      ...current,
      [activeSlug]: {
        ...current[activeSlug],
        [field]: value
      }
    }));
  };

  return (
    <div className="mx-auto min-h-full max-w-[1420px] px-4 py-6">
      <div className="overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.1),rgba(255,255,255,0.02)_40%,rgba(0,0,0,0.18)_100%)] shadow-[0_30px_120px_rgba(0,0,0,0.4)]">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-200/70">Information</p>
              <h1 className="mt-2 text-3xl font-black text-white">Legal and policy center</h1>
              <p className="mt-2 max-w-[760px] text-sm text-white/60">
                Public policy pages for Bloom. Owners can edit the published text here and changes propagate live to every client subscribed to this page.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isOwner ? (
                <>
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-100">
                    <ShieldCheck size={14} />
                    Owner editor enabled
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditMode((current) => !current)}
                    className={clsx(
                      'rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] transition',
                      editMode
                        ? 'border-cyan-300/40 bg-cyan-300/14 text-cyan-50'
                        : 'border-white/15 bg-white/6 text-white/72 hover:bg-white/10'
                    )}
                  >
                    {editMode ? 'Stop Editing' : 'Edit Live'}
                  </button>
                </>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-white/60">
                  <Lock size={14} />
                  Read only
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="border-b border-white/10 px-4 py-3">
          <nav className="flex flex-wrap gap-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.slug === activeSlug;
              return (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => setActiveSlug(item.slug)}
                  className={clsx(
                    'inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs font-black uppercase tracking-[0.14em] transition',
                    active
                      ? 'border-cyan-300/35 bg-cyan-300/12 text-cyan-50 shadow-[0_0_0_1px_rgba(103,232,249,0.1)_inset]'
                      : 'border-white/10 bg-white/[0.03] text-white/58 hover:bg-white/[0.08] hover:text-white'
                  )}
                >
                  <Icon size={14} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {loading ? (
          <div className="flex min-h-[420px] items-center justify-center gap-3 text-sm font-bold text-white/60">
            <LoaderCircle size={18} className="animate-spin" />
            Loading policy documents...
          </div>
        ) : (
          <div className="grid gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_330px]">
            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              {editMode && isOwner ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200/70">Live Editor</p>
                    <p className="mt-2 text-sm text-white/58">
                      Autosaves after a short pause. Use plain text with your own headings and numbered sections.
                    </p>
                  </div>

                  <label className="block">
                    <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.14em] text-white/48">Title</span>
                    <input
                      value={activeDraft.title}
                      onChange={(event) => updateDraft('title', event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-cyan-300/35 focus:bg-white/8"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.14em] text-white/48">Summary</span>
                    <textarea
                      value={activeDraft.summary}
                      onChange={(event) => updateDraft('summary', event.target.value)}
                      rows={3}
                      className="w-full resize-y rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/35 focus:bg-white/8"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.14em] text-white/48">Document Text</span>
                    <textarea
                      value={activeDraft.content}
                      onChange={(event) => updateDraft('content', event.target.value)}
                      rows={26}
                      className="min-h-[560px] w-full resize-y rounded-3xl border border-white/10 bg-[#09111c]/80 px-4 py-4 font-mono text-[13px] leading-6 text-slate-100 outline-none transition focus:border-cyan-300/35 focus:bg-[#0b1522]"
                    />
                  </label>
                </div>
              ) : (
                <article className="space-y-5">
                  <header className="border-b border-white/8 pb-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200/70">Published Document</p>
                    <h2 className="mt-2 text-3xl font-black text-white">{activeDraft.title}</h2>
                    <p className="mt-3 max-w-[780px] text-sm text-white/58">{activeDraft.summary}</p>
                  </header>
                  <div className="whitespace-pre-wrap text-[14px] leading-7 text-white/82">{activeDraft.content}</div>
                </article>
              )}
            </section>

            <aside className="space-y-4">
              <div className="rounded-[26px] border border-white/10 bg-black/20 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Status</p>
                <div className="mt-3 space-y-3 text-sm text-white/68">
                  <div>
                    <p className="font-black text-white">Current page</p>
                    <p>{NAV_ITEMS.find((item) => item.slug === activeSlug)?.label}</p>
                  </div>
                  <div>
                    <p className="font-black text-white">Last published</p>
                    <p>{activeDocument ? formatUpdatedAt(activeDocument.updated_at) : 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="font-black text-white">Live sync</p>
                    <p>{savingSlug === activeSlug ? 'Saving changes...' : 'Realtime subscription active'}</p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-[26px] border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100">
                  {error}
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
