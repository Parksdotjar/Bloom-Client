import { useEffect, useMemo, useState } from 'react';
import { GripVertical, Plus, Send, Save } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { ensureCommerceIdentity, type CommerceProfile } from '../services/cosmetics';
import { createNewsPost, listNewsPosts, subscribeNewsPosts, type NewsPostRecord, type NewsSection, type NewsSectionKind } from '../services/news';

function makeSection(kind: NewsSectionKind): NewsSection {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    title: '',
    body: ''
  };
}

export function News() {
  const { authState } = useAuth();
  const [profile, setProfile] = useState<CommerceProfile | null>(null);
  const [posts, setPosts] = useState<NewsPostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [postType, setPostType] = useState<NewsSectionKind>('announcement');
  const [sections, setSections] = useState<NewsSection[]>([makeSection('announcement')]);
  const [dragId, setDragId] = useState<string | null>(null);
  const isOwner = profile?.role === 'owner';

  const loadData = async () => {
    setLoading(true);
    try {
      const rows = await listNewsPosts(40, isOwner);
      setPosts(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authState) return;
    void ensureCommerceIdentity(authState.profile.id, authState.profile.name, authState.profile.name)
      .then((next) => setProfile(next))
      .catch(() => setProfile(null));
  }, [authState]);

  useEffect(() => {
    void loadData();
    const off = subscribeNewsPosts(() => {
      void loadData();
    });
    return () => off();
  }, [isOwner]);

  const canSave = useMemo(() => title.trim().length > 0 && sections.some((s) => s.title.trim() || s.body.trim()), [title, sections]);

  const updateSection = (id: string, patch: Partial<NewsSection>) => {
    setSections((current) => current.map((section) => (section.id === id ? { ...section, ...patch } : section)));
  };

  const removeSection = (id: string) => {
    setSections((current) => current.filter((section) => section.id !== id));
  };

  const appendSection = (kind: NewsSectionKind) => {
    setSections((current) => [...current, makeSection(kind)]);
  };

  const persistPost = async (mode: 'draft' | 'published') => {
    if (!isOwner) return;
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      await createNewsPost({
        title: title.trim(),
        postType,
        status: mode,
        sections
      });
      setTitle('');
      setSections([makeSection(postType)]);
      setStatus(mode === 'published' ? 'Update sent to all clients.' : 'Draft saved.');
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto min-h-full py-6 space-y-4">
      <section className="g-panel p-5">
        <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-white/55">Bloom Feed</p>
        <h1 className="text-3xl font-extrabold text-white mt-1">Updates & Changelog</h1>
      </section>

      {status && <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-200">{status}</div>}
      {error && <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-xs font-bold text-red-200">{error}</div>}

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
        <div className="g-panel p-4 min-h-[560px]">
          <p className="text-[10px] uppercase tracking-[0.12em] font-extrabold text-white/55">Live Feed</p>
          <div className="mt-3 space-y-3 max-h-[620px] overflow-y-auto pr-1">
            {loading ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">Loading updates...</div>
            ) : posts.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">No updates posted yet.</div>
            ) : (
              posts.map((post) => (
                <article key={post.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-extrabold text-white">{post.title}</h3>
                    <span className="text-[10px] uppercase tracking-[0.12em] font-extrabold text-white/60">{post.post_type}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-white/55">
                    {post.status === 'draft' ? 'Draft' : 'Published'} · {new Date(post.published_at || post.updated_at).toLocaleString()}
                  </p>
                  <div className="mt-3 space-y-2">
                    {post.sections.map((section) => (
                      <div key={section.id} className="rounded-lg border border-white/10 bg-black/20 p-2">
                        <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-white/70">{section.kind}</p>
                        {section.title && <p className="text-sm font-bold text-white mt-1">{section.title}</p>}
                        {section.body && <p className="text-xs text-white/70 mt-1 whitespace-pre-wrap">{section.body}</p>}
                      </div>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <aside className="g-panel p-4">
          <p className="text-[10px] uppercase tracking-[0.12em] font-extrabold text-white/55">Owner Builder</p>
          {!isOwner ? (
            <p className="mt-3 text-sm text-white/60">Owner role required.</p>
          ) : (
            <>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Update title"
                className="mt-3 h-10 w-full rounded-lg border border-white/15 bg-black/35 px-3 text-sm text-white placeholder:text-white/35 outline-none"
              />
              <select
                value={postType}
                onChange={(event) => setPostType(event.target.value as NewsSectionKind)}
                className="mt-2 h-10 w-full rounded-lg border border-white/15 bg-black/35 px-3 text-sm font-bold text-white outline-none"
              >
                <option value="announcement">Announcement</option>
                <option value="devlog">Devlog</option>
                <option value="changelog">Changelog</option>
              </select>

              <div className="mt-3 space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {sections.map((section) => (
                  <div
                    key={section.id}
                    draggable
                    onDragStart={() => setDragId(section.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (!dragId || dragId === section.id) return;
                      setSections((current) => {
                        const from = current.findIndex((row) => row.id === dragId);
                        const to = current.findIndex((row) => row.id === section.id);
                        if (from < 0 || to < 0) return current;
                        const next = [...current];
                        const [moved] = next.splice(from, 1);
                        next.splice(to, 0, moved);
                        return next;
                      });
                      setDragId(null);
                    }}
                    className="rounded-lg border border-white/10 bg-white/[0.03] p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-2">
                        <GripVertical size={13} className="text-white/55" />
                        <select
                          value={section.kind}
                          onChange={(event) => updateSection(section.id, { kind: event.target.value as NewsSectionKind })}
                          className="h-7 rounded-md border border-white/15 bg-black/35 px-2 text-[11px] font-bold text-white outline-none"
                        >
                          <option value="announcement">Announcement</option>
                          <option value="devlog">Devlog</option>
                          <option value="changelog">Changelog</option>
                        </select>
                      </div>
                      <button onClick={() => removeSection(section.id)} className="g-btn h-7 px-2 text-[10px] uppercase tracking-[0.12em] font-extrabold">
                        Remove
                      </button>
                    </div>
                    <input
                      value={section.title}
                      onChange={(event) => updateSection(section.id, { title: event.target.value })}
                      placeholder="Section title"
                      className="mt-2 h-8 w-full rounded-md border border-white/15 bg-black/35 px-2 text-xs text-white placeholder:text-white/35 outline-none"
                    />
                    <textarea
                      value={section.body}
                      onChange={(event) => updateSection(section.id, { body: event.target.value })}
                      placeholder="Section text"
                      rows={3}
                      className="mt-2 w-full rounded-md border border-white/15 bg-black/35 px-2 py-2 text-xs text-white placeholder:text-white/35 outline-none resize-y"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => appendSection('announcement')} className="g-btn h-8 px-2 text-[10px] uppercase tracking-[0.12em] font-extrabold inline-flex items-center gap-1">
                  <Plus size={12} /> Announcement
                </button>
                <button onClick={() => appendSection('devlog')} className="g-btn h-8 px-2 text-[10px] uppercase tracking-[0.12em] font-extrabold inline-flex items-center gap-1">
                  <Plus size={12} /> Devlog
                </button>
                <button onClick={() => appendSection('changelog')} className="g-btn h-8 px-2 text-[10px] uppercase tracking-[0.12em] font-extrabold inline-flex items-center gap-1">
                  <Plus size={12} /> Changelog
                </button>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  disabled={!canSave || saving}
                  onClick={() => {
                    void persistPost('draft');
                  }}
                  className="g-btn h-10 flex-1 text-[11px] uppercase tracking-[0.12em] font-extrabold inline-flex items-center justify-center gap-2 disabled:opacity-45"
                >
                  <Save size={13} /> Draft
                </button>
                <button
                  disabled={!canSave || saving}
                  onClick={() => {
                    void persistPost('published');
                  }}
                  className="g-btn-accent h-10 flex-1 text-[11px] uppercase tracking-[0.12em] font-extrabold inline-flex items-center justify-center gap-2 disabled:opacity-45"
                >
                  <Send size={13} /> Send Update
                </button>
              </div>
            </>
          )}
        </aside>
      </section>
    </div>
  );
}

