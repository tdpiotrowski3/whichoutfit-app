import { admin } from "./supabase";

export type Overview = {
  total_signups: number;
  profiles: number;
  premium_active: number;
  ai_stylist_used_month: number;
  ai_tagging_used_month: number;
  credits_outstanding: number;
  closet_items: number;
  users_with_closet: number;
  saved_looks: number;
  worn_outfits: number;
  iap_subscriptions: number;
  iap_credit_packs: number;
  ai_calls_total: number;
  ai_calls_30d: number;
  ai_limit_hits_30d: number;
  storage_mb: number;
  storage_objects: number;
  db_size_mb: number;
};

export async function getOverview(): Promise<Overview> {
  const { data, error } = await admin().rpc("admin_overview");
  if (error) throw error;
  return data as Overview;
}

export type AiDailyRow = { day: string; kind: string; calls: number; total_tokens: number };

export async function getAiDaily(days = 30): Promise<AiDailyRow[]> {
  const { data, error } = await admin().rpc("admin_ai_daily", { days });
  if (error) throw error;
  return (data ?? []) as AiDailyRow[];
}

export type UserRow = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  premium: boolean;
  premium_until: string | null;
  free_used: number;
  tagging_used: number;
  credits: number;
  ai_calls: number;
  closet_items: number;
  last_active: string | null;
};

export async function getUsers(): Promise<UserRow[]> {
  const sb = admin();

  const [{ data: list }, ents, usage, closet] = await Promise.all([
    sb.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    sb.from("entitlements").select("user_id, premium_until, free_used, tagging_used, credits"),
    sb.rpc("admin_user_usage"),
    sb.from("closet_items").select("user_id").is("deleted_at", null),
  ]);

  const entById = new Map<string, { premium_until: string | null; free_used: number; tagging_used: number; credits: number }>();
  for (const e of ents.data ?? []) entById.set(e.user_id as string, e as never);

  const usageById = new Map<string, { ai_calls: number; last_active: string | null }>();
  for (const u of (usage.data ?? []) as { user_id: string; ai_calls: number; last_active: string | null }[]) {
    usageById.set(u.user_id, { ai_calls: Number(u.ai_calls), last_active: u.last_active });
  }

  const closetById = new Map<string, number>();
  for (const c of (closet.data ?? []) as { user_id: string }[]) {
    closetById.set(c.user_id, (closetById.get(c.user_id) ?? 0) + 1);
  }

  const now = Date.now();
  const users = list?.users ?? [];
  return users.map((u) => {
    const e = entById.get(u.id);
    const usg = usageById.get(u.id);
    const premiumUntil = e?.premium_until ?? null;
    return {
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      premium: premiumUntil ? new Date(premiumUntil).getTime() > now : false,
      premium_until: premiumUntil,
      free_used: e?.free_used ?? 0,
      tagging_used: e?.tagging_used ?? 0,
      credits: e?.credits ?? 0,
      ai_calls: usg?.ai_calls ?? 0,
      closet_items: closetById.get(u.id) ?? 0,
      last_active: usg?.last_active ?? null,
    };
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export type AppstoreRow = {
  day: string;
  units: number;
  downloads: number;
  redownloads: number;
  updates: number;
  proceeds: number;
  impressions: number | null;
  product_page_views: number | null;
  conversion_rate: number | null;
};

export async function getAppstore(days = 30): Promise<AppstoreRow[]> {
  const { data, error } = await admin().rpc("admin_appstore", { days });
  if (error) throw error;
  return (data ?? []) as AppstoreRow[];
}

// --- Marketing segmentation (underused-feature nudges) ---

export type UsageFeature = { kind: string; users: number };

/** Distinct usage_events features (kinds) + how many users have used each. */
export async function getUsageFeatures(): Promise<UsageFeature[]> {
  const { data, error } = await admin().rpc("admin_usage_features");
  if (error) throw error;
  return ((data ?? []) as { kind: string; users: number }[]).map((r) => ({
    kind: r.kind,
    users: Number(r.users),
  }));
}

export type FeatureSegmentRow = {
  user_id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  opted_in: boolean;
  /** Deliverable email captured at consent time (may differ from the auth email). */
  consent_email: string | null;
  consent_at: string | null;
};

/** Users who have NOT used `feature`, joined to marketing_consent (opted-in first). */
export async function getFeatureSegment(feature: string): Promise<FeatureSegmentRow[]> {
  const { data, error } = await admin().rpc("admin_feature_segment", { feature });
  if (error) throw error;
  return (data ?? []) as FeatureSegmentRow[];
}
