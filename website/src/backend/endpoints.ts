export const backendConfig = {
  siteUrl: import.meta.env.VITE_SITE_URL || "https://bloomclient.org",
  updatesManifest: import.meta.env.VITE_UPDATES_JSON_URL || "/latest.json",
  skStudioManifest: import.meta.env.VITE_SKS_UPDATES_JSON_URL || "/sks-latest.json",
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || "",
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
  newsTable: import.meta.env.VITE_SUPABASE_NEWS_TABLE || "news_posts",
  newsFields: import.meta.env.VITE_SUPABASE_NEWS_FIELDS || "id,title,slug,summary,published_at",
  newsOrderColumn: import.meta.env.VITE_SUPABASE_NEWS_ORDER_COLUMN || "published_at",
  newsPublishedColumn: import.meta.env.VITE_SUPABASE_NEWS_PUBLISHED_COLUMN || "is_published",
  newsLimit: Number(import.meta.env.VITE_SUPABASE_NEWS_LIMIT || 8)
} as const;

function functionUrl(override: string | undefined, functionName: string): string {
  if (override) return override.replace(/\/+$/, "");
  if (!backendConfig.supabaseUrl) return "";

  try {
    return `${new URL(backendConfig.supabaseUrl).origin.replace(/\/+$/, "")}/functions/v1/${functionName}`;
  } catch {
    return `${backendConfig.supabaseUrl.replace(/\/+$/, "")}/functions/v1/${functionName}`;
  }
}

export const backendEndpoints = {
  support: functionUrl(
    import.meta.env.VITE_SUPABASE_SUPPORT_FUNCTION_URL || import.meta.env.VITE_SUPABASE_FUNCTIONS_URL,
    "support"
  ),
  budLicense: functionUrl(import.meta.env.VITE_SUPABASE_BUD_FUNCTION_URL, "bud-license"),
  editingCourse: functionUrl(import.meta.env.VITE_SUPABASE_EDITING_COURSE_FUNCTION_URL, "editing-course")
} as const;

export const backendTables = {
  profiles: "commerce_profiles",
  productionDocuments: "production_hub_documents"
} as const;

export const backendBuckets = {
  profileImages: "profile-images",
  editingCourseVideos: "editing-course-videos"
} as const;
