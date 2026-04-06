import { supabase } from './supabase';
import { isCurrentUserOwner } from './cosmetics';

export type LegalDocumentSlug = 'tos' | 'privacy-policy' | 'payment-policy';

export type LegalDocumentRecord = {
  slug: LegalDocumentSlug;
  title: string;
  summary: string;
  content: string;
  updated_at: string;
  updated_by: string | null;
};

export const LEGAL_DOCUMENT_ORDER: LegalDocumentSlug[] = ['tos', 'privacy-policy', 'payment-policy'];

export async function loadLegalDocuments() {
  const { data, error } = await supabase
    .from('legal_documents')
    .select('slug,title,summary,content,updated_at,updated_by');
  if (error) throw error;
  return (data ?? []) as LegalDocumentRecord[];
}

export async function saveLegalDocument(
  slug: LegalDocumentSlug,
  payload: Pick<LegalDocumentRecord, 'title' | 'summary' | 'content'>
) {
  const allowed = await isCurrentUserOwner();
  if (!allowed) throw new Error('owner_role_required');

  const { data, error } = await supabase
    .from('legal_documents')
    .upsert(
      {
        slug,
        title: payload.title.trim(),
        summary: payload.summary.trim(),
        content: payload.content.replace(/\r\n/g, '\n').trim()
      },
      { onConflict: 'slug' }
    )
    .select('slug,title,summary,content,updated_at,updated_by')
    .single();
  if (error) throw error;
  return data as LegalDocumentRecord;
}

export function subscribeLegalDocuments(onChange: () => void) {
  const channel = supabase
    .channel('legal-documents-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'legal_documents' }, () => onChange())
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
