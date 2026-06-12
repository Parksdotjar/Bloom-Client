import type { Session, User } from "@supabase/supabase-js";

export type SiteSession = Session;
export type SiteUser = User;

export type UpdatePlatform = {
  installerUrl?: string;
  assetName?: string;
  nsisUrl?: string;
  nsisAssetName?: string;
  msiUrl?: string;
  msiAssetName?: string;
  fallbackInstallerUrls?: string[];
};

export type UpdateManifest = {
  version?: string;
  installerUrl?: string;
  assetName?: string;
  msiUrl?: string;
  msiAssetName?: string;
  fallbackInstallerUrls?: string[];
  windows?: UpdatePlatform;
};

export type Release = {
  version: string;
  exeUrl?: string;
  exeAssetName?: string;
  msiUrl?: string;
  msiAssetName?: string;
};

export type NewsItem = {
  id?: string | number;
  slug?: string;
  title: string;
  summary: string;
  published_at?: string;
};

export type SupportOption = {
  slug: string;
  label: string;
  amount_cents: number;
  currency: string;
};

export type CommerceProfile = {
  user_id: string;
  username?: string;
  display_name?: string;
  email?: string;
  role?: string;
  profile_image_url?: string;
  bud_license_status?: string;
  bud_plan?: string;
};

export type BudPurchase = {
  id: string;
  plan: "lifetime" | "monthly" | "free";
  status: string;
  amount_cents: number;
  currency: string;
  created_at?: string;
  completed_at?: string;
};

export type BudLicense = {
  id: string;
  plan: "lifetime" | "monthly" | "free";
  activated: boolean;
  activated_at?: string | null;
  expires_at?: string | null;
  revoked?: boolean;
  created_at?: string;
};

export type ProductionDoc = {
  id: string;
  title: string;
  content_html: string;
  sort_order: number;
  updated_at?: string;
  updated_by?: string | null;
};

export type EditingCourseLesson = {
  id: string;
  course_id: string;
  title: string;
  description?: string | null;
  storage_path?: string | null;
  signed_video_url?: string | null;
  duration_seconds?: number | null;
  metadata?: Record<string, unknown>;
  sort_order: number;
  is_active: boolean;
  has_video?: boolean;
};

export type EditingCourse = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  price_cents: number;
  currency: string;
  sort_order: number;
  is_active: boolean;
  collapsed_default: boolean;
  is_bundle: boolean;
  owned: boolean;
  lessons: EditingCourseLesson[];
};

export type BudSummary = {
  profile?: CommerceProfile | null;
  purchases?: BudPurchase[];
  licenses?: BudLicense[];
  monthly_available?: boolean;
};

export type EditingCourseCatalog = {
  courses?: EditingCourse[];
  is_owner?: boolean;
  owns_bundle?: boolean;
};
