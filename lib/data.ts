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
  /** Projection basis: real users only (seed/test accounts excluded). */
  proj_users: number;
  proj_storage_mb: number;
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

// Apple restates ~1 day late, so up to 2 days stale is normal. Anything older
// means the daily appstore-sync cron has stopped landing data (e.g. Apple auth
// revoked) and the App Store totals are silently wrong.
export const APPSTORE_STALE_AFTER_DAYS = 2;

export type AppstoreFreshness = { latestDay: string | null; daysStale: number | null; isStale: boolean };

/** Whole-days between an ISO `YYYY-MM-DD` day and now (UTC). */
export function daysStaleSince(latestDay: string | null): number | null {
  if (!latestDay) return null;
  return Math.floor((Date.now() - new Date(`${latestDay}T00:00:00Z`).getTime()) / 86_400_000);
}

/** Cheap freshness probe: the most recent App Store day we have, and how stale it is. */
export async function getAppstoreFreshness(): Promise<AppstoreFreshness> {
  const { data, error } = await admin()
    .from("appstore_metrics")
    .select("day")
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const latestDay = (data?.day as string | undefined) ?? null;
  const daysStale = daysStaleSince(latestDay);
  return { latestDay, daysStale, isStale: daysStale != null && daysStale > APPSTORE_STALE_AFTER_DAYS };
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

// --- Social & ads metrics ---

export type SocialMetricDbRow = {
  day: string;
  platform: string;
  followers: number | null;
  impressions: number | null;
  reach: number | null;
  profile_views: number | null;
  video_views: number | null;
  engagements: number | null;
  spend: number | null;
  ad_impressions: number | null;
  clicks: number | null;
  conversions: number | null;
};

export async function getSocialMetrics(days = 30): Promise<SocialMetricDbRow[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await admin()
    .from("social_metrics")
    .select("*")
    .gte("day", since)
    .order("day", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SocialMetricDbRow[];
}

// --- Finance (expense ledger, ROI, runway) ---
// Backed by the public.expenses table + the admin_finance_overview /
// admin_spend_by_category views (RLS-on, service-role-only). Amounts stored as
// integer cents; entry_type 'cash' = real charge, 'memo' = non-cash (Meta ad
// spend drawn from already-funded prepaid balance, excluded from cash totals).

export type FinanceOverview = {
  revenue_usd: number;
  cash_spend_usd: number;
  roi_cost_usd: number;
  overhead_usd: number;
  excluded_usd: number;
  marketing_spend_usd: number;
  net_usd: number;
  roi_ratio: number | null;
};

export async function getFinanceOverview(): Promise<FinanceOverview> {
  const { data, error } = await admin().from("admin_finance_overview").select("*").single();
  if (error) throw error;
  const d = data as Record<string, string | number | null>;
  return {
    revenue_usd: Number(d.revenue_usd ?? 0),
    cash_spend_usd: Number(d.cash_spend_usd ?? 0),
    roi_cost_usd: Number(d.roi_cost_usd ?? 0),
    overhead_usd: Number(d.overhead_usd ?? 0),
    excluded_usd: Number(d.excluded_usd ?? 0),
    marketing_spend_usd: Number(d.marketing_spend_usd ?? 0),
    net_usd: Number(d.net_usd ?? 0),
    roi_ratio: d.roi_ratio == null ? null : Number(d.roi_ratio),
  };
}

export type SpendCategory = { category: string; cash_usd: number; cash_count: number };

export async function getSpendByCategory(): Promise<SpendCategory[]> {
  const { data, error } = await admin().from("admin_spend_by_category").select("*");
  if (error) throw error;
  return ((data ?? []) as Record<string, string | number | null>[]).map((r) => ({
    category: String(r.category),
    cash_usd: Number(r.cash_usd ?? 0),
    cash_count: Number(r.cash_count ?? 0),
  }));
}

export type ExpenseRow = {
  id: string;
  txn_date: string;
  vendor: string;
  description: string | null;
  category: string;
  amount_cents: number;
  payment_method: string | null;
  entry_type: "cash" | "memo";
  roi_impacting: boolean;
  excluded: boolean;
  receipt_ref: string | null;
  receipt_path: string | null;
  deductible: boolean;
  source: string;
  notes: string | null;
};

export async function getExpenses(): Promise<ExpenseRow[]> {
  const { data, error } = await admin()
    .from("expenses")
    .select("id,txn_date,vendor,description,category,amount_cents,payment_method,entry_type,roi_impacting,excluded,receipt_ref,receipt_path,deductible,source,notes")
    .order("txn_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ExpenseRow[];
}

// ── Growth (activation funnel) ────────────────────────────────────────────────

export type Growth = {
  days: number;
  signups_window: number;
  signups_by_day: { day: string; signups: number }[];
  /** Real signups that hit an AI moment within 24h (the 40% day-1 target). */
  activated_day1: number;
  activated_ever: number;
  /** Came back on a later calendar day (needs app_open events — flows from
   *  builds that include the track client; 0 until then is expected). */
  second_session_users: number;
  /** Which onboarding start-screen card new users pick. */
  start_choices: Record<string, number>;
  onboarding_steps: Record<string, number>;
  referral_redemptions: number;
  premium_real: number;
  product_searches: number;
};

export async function getGrowth(days = 30): Promise<Growth> {
  const { data, error } = await admin().rpc("admin_growth", { days });
  if (error) throw error;
  return data as Growth;
}
