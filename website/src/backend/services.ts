import type { RealtimeChannel, Session, SupabaseClient } from "@supabase/supabase-js";
import { createPublicSupabaseClient, getBrowserSupabaseClient } from "./clients";
import { backendBuckets, backendConfig, backendEndpoints, backendTables } from "./endpoints";
import type {
  BudSummary,
  CommerceProfile,
  EditingCourse,
  EditingCourseCatalog,
  NewsItem,
  ProductionDoc,
  Release,
  SupportOption,
  UpdateManifest
} from "./types";

type ApiErrorPayload = {
  message?: string;
  error?: string;
};

function requireClient(): SupabaseClient {
  const client = getBrowserSupabaseClient();
  if (!client) throw new Error("Supabase is not configured.");
  return client;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & ApiErrorPayload;
  if (!response.ok) throw new Error(payload.message || payload.error || `Request failed (${response.status}).`);
  return payload;
}

async function authorizedFunctionRequest<T>(
  baseUrl: string,
  path: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<T> {
  if (!baseUrl) throw new Error("The requested backend service is not configured.");
  if (!accessToken) throw new Error("Sign in first.");

  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  return parseResponse<T>(
    await fetch(`${baseUrl}${path}`, { ...init, headers, cache: "no-store" })
  );
}

function inferAssetName(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
  } catch {
    return decodeURIComponent(url.split("?")[0].split("/").pop() || "");
  }
}

export function parseReleaseManifest(payload: UpdateManifest): Release {
  const windows = payload.windows || {};
  const exeUrl =
    windows.installerUrl ||
    windows.nsisUrl ||
    payload.installerUrl ||
    windows.fallbackInstallerUrls?.[0] ||
    payload.fallbackInstallerUrls?.[0];
  const msiUrl = windows.msiUrl || payload.msiUrl;

  return {
    version: payload.version || "unknown",
    exeUrl,
    exeAssetName:
      windows.assetName || windows.nsisAssetName || payload.assetName || inferAssetName(exeUrl),
    msiUrl,
    msiAssetName: windows.msiAssetName || payload.msiAssetName || inferAssetName(msiUrl)
  };
}

export async function loadReleaseManifest(url: string): Promise<Release> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Manifest request failed (${response.status}).`);
  return parseReleaseManifest((await response.json()) as UpdateManifest);
}

export const manifestService = {
  loadBloomClient: () => loadReleaseManifest(backendConfig.updatesManifest),
  loadSkStudio: () => loadReleaseManifest(backendConfig.skStudioManifest)
};

export async function loadNews(): Promise<NewsItem[]> {
  const client = createPublicSupabaseClient() as any;
  if (!client) throw new Error("Supabase news is not configured.");

  let query = client
    .from(backendConfig.newsTable)
    .select(backendConfig.newsFields)
    .order(backendConfig.newsOrderColumn, { ascending: false })
    .limit(Number.isFinite(backendConfig.newsLimit) ? backendConfig.newsLimit : 8);

  if (backendConfig.newsPublishedColumn) {
    query = query.eq(backendConfig.newsPublishedColumn, true);
  }

  const { data, error }: {
    data: Record<string, unknown>[] | null;
    error: { message?: string } | null;
  } = await query;
  if (error) throw error;

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string | number | undefined,
    slug: row.slug as string | undefined,
    title: (row.title as string | undefined) || "Untitled",
    summary:
      (row.summary as string | undefined) ||
      (row.excerpt as string | undefined) ||
      "No summary provided.",
    published_at: row.published_at as string | undefined
  }));
}

export const authService = {
  async getSession(): Promise<Session | null> {
    const { data, error } = await requireClient().auth.getSession();
    if (error) throw error;
    return data.session;
  },
  signIn(email: string, password: string) {
    return requireClient().auth.signInWithPassword({ email, password });
  },
  signUp(email: string, password: string, username: string, emailRedirectTo: string) {
    return requireClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo, data: { username } }
    });
  },
  signOut() {
    return requireClient().auth.signOut();
  },
  onAuthStateChange(callback: Parameters<SupabaseClient["auth"]["onAuthStateChange"]>[0]) {
    return requireClient().auth.onAuthStateChange(callback);
  }
};

export const profileService = {
  async upsert(profile: CommerceProfile): Promise<void> {
    const { error } = await requireClient().from(backendTables.profiles).upsert(profile);
    if (error) throw error;
  },
  async uploadAvatar(userId: string, file: File): Promise<string> {
    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${userId}/avatar-${Date.now()}.${extension}`;
    const client = requireClient();
    const { error } = await client.storage.from(backendBuckets.profileImages).upload(path, file, {
      cacheControl: "3600",
      upsert: true
    });
    if (error) throw error;
    return client.storage.from(backendBuckets.profileImages).getPublicUrl(path).data.publicUrl;
  }
};

export const supportService = {
  async options(): Promise<SupportOption[]> {
    if (!backendEndpoints.support) throw new Error("Support checkout is not configured.");
    const payload = await parseResponse<{ ok?: boolean; options?: SupportOption[] }>(
      await fetch(`${backendEndpoints.support}/options`, { cache: "no-store" })
    );
    if (!payload.ok) throw new Error("Support options could not be loaded.");
    return payload.options || [];
  },
  async checkout(input: { optionSlug?: string; amountUsd?: string; returnOrigin: string }): Promise<string> {
    if (!backendEndpoints.support) throw new Error("Support checkout is not configured.");
    const body: Record<string, string> = { return_origin: input.returnOrigin };
    if (input.optionSlug) body.option_slug = input.optionSlug;
    if (input.amountUsd) body.amount_usd = input.amountUsd;

    const payload = await parseResponse<{ ok?: boolean; checkout_url?: string | null }>(
      await fetch(`${backendEndpoints.support}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
    );
    if (!payload.ok || !payload.checkout_url) throw new Error("Support checkout did not return a URL.");
    return payload.checkout_url;
  }
};

export const budService = {
  summary: (accessToken: string) =>
    authorizedFunctionRequest<BudSummary>(backendEndpoints.budLicense, "/summary", accessToken),
  checkout: async (accessToken: string, plan: "lifetime" | "monthly", returnOrigin: string) => {
    const payload = await authorizedFunctionRequest<{ checkout_url?: string }>(
      backendEndpoints.budLicense,
      "/checkout",
      accessToken,
      { method: "POST", body: JSON.stringify({ plan, return_origin: returnOrigin }) }
    );
    if (!payload.checkout_url) throw new Error("Checkout did not return a URL.");
    return payload.checkout_url;
  },
  claimKey: (accessToken: string) =>
    authorizedFunctionRequest<{ license_key?: string; plan?: string; expires_at?: string | null; message?: string }>(
      backendEndpoints.budLicense,
      "/claim-key",
      accessToken,
      { method: "POST", body: JSON.stringify({}) }
    ),
  ownerUsers: (accessToken: string) =>
    authorizedFunctionRequest<{ users?: CommerceProfile[] }>(
      backendEndpoints.budLicense,
      "/owner/users",
      accessToken
    ),
  grantFreeLicense: (accessToken: string, userId: string) =>
    authorizedFunctionRequest<{ ok?: boolean }>(
      backendEndpoints.budLicense,
      "/owner/free-license",
      accessToken,
      { method: "POST", body: JSON.stringify({ user_id: userId }) }
    ),
  setUserRole: (accessToken: string, userId: string, role: string) =>
    authorizedFunctionRequest<{ ok?: boolean }>(
      backendEndpoints.budLicense,
      "/owner/set-role",
      accessToken,
      { method: "POST", body: JSON.stringify({ user_id: userId, role }) }
    )
};

export const editingCourseService = {
  catalog: (accessToken: string) =>
    authorizedFunctionRequest<EditingCourseCatalog>(
      backendEndpoints.editingCourse,
      "/catalog",
      accessToken
    ),
  ownerCatalog: (accessToken: string) =>
    authorizedFunctionRequest<{ courses?: EditingCourse[]; is_owner?: boolean }>(
      backendEndpoints.editingCourse,
      "/owner/catalog",
      accessToken
    ),
  checkout: async (accessToken: string, courseId: string, returnOrigin: string) => {
    const payload = await authorizedFunctionRequest<{ checkout_url?: string }>(
      backendEndpoints.editingCourse,
      "/checkout",
      accessToken,
      { method: "POST", body: JSON.stringify({ course_id: courseId, return_origin: returnOrigin }) }
    );
    if (!payload.checkout_url) throw new Error("Checkout did not return a URL.");
    return payload.checkout_url;
  },
  saveCourse: (accessToken: string, course: Record<string, unknown>) =>
    authorizedFunctionRequest(
      backendEndpoints.editingCourse,
      "/owner/course",
      accessToken,
      { method: "POST", body: JSON.stringify(course) }
    ),
  saveLesson: (accessToken: string, lesson: Record<string, unknown>) =>
    authorizedFunctionRequest(
      backendEndpoints.editingCourse,
      "/owner/lesson",
      accessToken,
      { method: "POST", body: JSON.stringify(lesson) }
    ),
  async uploadVideo(file: File, courseId: string, lessonId = "new"): Promise<string> {
    if (file.type !== "video/mp4" && !file.name.toLowerCase().endsWith(".mp4")) {
      throw new Error("Upload an MP4 file.");
    }
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    const path = `courses/${courseId}/${lessonId}/${Date.now()}-${safeName || "lesson.mp4"}`;
    const { error } = await requireClient().storage.from(backendBuckets.editingCourseVideos).upload(path, file, {
      cacheControl: "3600",
      contentType: "video/mp4",
      upsert: true
    });
    if (error) throw error;
    return path;
  }
};

export const productionHubService = {
  async list(): Promise<ProductionDoc[]> {
    const { data, error } = await requireClient()
      .from(backendTables.productionDocuments)
      .select("id,title,content_html,sort_order,updated_at,updated_by")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  },
  async create(userId: string, position: number): Promise<ProductionDoc> {
    const { data, error } = await requireClient()
      .from(backendTables.productionDocuments)
      .insert({
        title: `New Doc ${position + 1}`,
        content_html: "<h1>Untitled</h1><p>Start writing...</p>",
        sort_order: position * 10 + 10,
        created_by: userId,
        updated_by: userId
      })
      .select("id,title,content_html,sort_order,updated_at,updated_by")
      .single();
    if (error) throw error;
    return data;
  },
  async update(docId: string, updates: Partial<ProductionDoc>): Promise<void> {
    const { error } = await requireClient()
      .from(backendTables.productionDocuments)
      .update(updates)
      .eq("id", docId);
    if (error) throw error;
  },
  subscribe(onChange: (payload: unknown) => void): RealtimeChannel {
    return requireClient()
      .channel("production-hub-documents")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: backendTables.productionDocuments },
        onChange
      )
      .subscribe();
  },
  unsubscribe(channel: RealtimeChannel) {
    return requireClient().removeChannel(channel);
  }
};
