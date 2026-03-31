import { supabase } from './supabase';

export type NewsSectionKind = 'announcement' | 'devlog' | 'changelog';

export type NewsSection = {
  id: string;
  kind: NewsSectionKind;
  title: string;
  body: string;
};

export type NewsPostStatus = 'draft' | 'published';

export type NewsPostRecord = {
  id: string;
  title: string;
  post_type: NewsSectionKind;
  status: NewsPostStatus;
  sections: NewsSection[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

type NewsPostRow = {
  id: string;
  title: string;
  post_type: string;
  status: string;
  content_json: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

function normalizeSectionKind(value: unknown): NewsSectionKind {
  const text = String(value ?? '').toLowerCase();
  if (text === 'announcement' || text === 'devlog' || text === 'changelog') return text;
  return 'announcement';
}

function normalizeSections(content: unknown): NewsSection[] {
  if (!Array.isArray(content)) return [];
  return content
    .map((entry, idx) => {
      const row = entry as Partial<NewsSection>;
      const title = String(row?.title ?? '').trim();
      const body = String(row?.body ?? '').trim();
      if (!title && !body) return null;
      return {
        id: String(row?.id ?? `section-${idx}-${Date.now()}`),
        kind: normalizeSectionKind(row?.kind),
        title,
        body
      } as NewsSection;
    })
    .filter((entry): entry is NewsSection => Boolean(entry));
}

function mapRow(row: NewsPostRow): NewsPostRecord {
  return {
    id: row.id,
    title: row.title,
    post_type: normalizeSectionKind(row.post_type),
    status: row.status === 'draft' ? 'draft' : 'published',
    sections: normalizeSections(row.content_json),
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    published_at: row.published_at
  };
}

export async function listNewsPosts(limit = 20, includeDrafts = false) {
  let query = supabase
    .from('launcher_news_posts')
    .select('id,title,post_type,status,content_json,created_by,created_at,updated_at,published_at')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(Math.max(1, Math.min(100, Math.round(limit))));

  if (!includeDrafts) {
    query = query.eq('status', 'published');
  }

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as NewsPostRow[]).map(mapRow);
}

export async function createNewsPost(input: {
  title: string;
  postType: NewsSectionKind;
  status: NewsPostStatus;
  sections: NewsSection[];
}) {
  const now = new Date().toISOString();
  const payload = {
    title: input.title.trim(),
    post_type: input.postType,
    status: input.status,
    content_json: input.sections,
    published_at: input.status === 'published' ? now : null
  };
  const { data, error } = await supabase
    .from('launcher_news_posts')
    .insert(payload)
    .select('id,title,post_type,status,content_json,created_by,created_at,updated_at,published_at')
    .single();
  if (error) throw error;
  return mapRow(data as NewsPostRow);
}

export function subscribeNewsPosts(onChange: () => void) {
  const channel = supabase
    .channel('launcher-news-posts')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'launcher_news_posts' }, () => onChange())
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

