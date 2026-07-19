import { getUsers } from "@/lib/data";
import { Card } from "@/components/ui";
import { GrantPromoButton } from "./GrantPromoButton";

export const dynamic = "force-dynamic";

function fmt(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}

export default async function UsersPage() {
  let users;
  try {
    users = await getUsers();
  } catch {
    return (
      <Card title="Not configured">
        <p className="text-sm text-[var(--wo-muted)]">Set Supabase env vars to load users.</p>
      </Card>
    );
  }

  const premiumCount = users.filter((u) => u.premium).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-[var(--wo-muted)]">{users.length} total · {premiumCount} premium. ⚠️ Apple private-relay emails may be unreachable for marketing.</p>
        <p className="mt-1 text-xs text-[var(--wo-muted)]">Spot a low-adoption user (0 AI calls / empty closet)? Hit <strong>Give 2 weeks free</strong> to gift 14 days Premium + 15 credits — they get an in-app popup and can share for 2 more weeks.</p>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--wo-border)] text-left text-xs uppercase tracking-wide text-[var(--wo-muted)]">
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Tier</th>
                <th className="py-2 pr-4 font-medium">Signed up</th>
                <th className="py-2 pr-4 font-medium">Last active</th>
                <th className="py-2 pr-4 font-medium text-right">AI calls</th>
                <th className="py-2 pr-4 font-medium text-right">Stylist/mo</th>
                <th className="py-2 pr-4 font-medium text-right">Closet</th>
                <th className="py-2 pl-4 font-medium text-right">Grant</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[var(--wo-border)] last:border-0">
                  <td className="py-2.5 pr-4 font-medium">{u.email ?? <span className="text-[var(--wo-muted)]">no email</span>}</td>
                  <td className="py-2.5 pr-4">
                    {u.premium ? (
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: "var(--wo-green)" }}>Premium</span>
                    ) : (
                      <span className="rounded-full bg-[var(--wo-bg)] px-2 py-0.5 text-xs font-medium text-[var(--wo-muted)]">Free</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-[var(--wo-muted)]">{fmt(u.created_at)}</td>
                  <td className="py-2.5 pr-4 text-[var(--wo-muted)]">{fmt(u.last_active ?? u.last_sign_in_at)}</td>
                  <td className="py-2.5 pr-4 text-right">{u.ai_calls}</td>
                  <td className="py-2.5 pr-4 text-right">{u.free_used}</td>
                  <td className="py-2.5 pr-4 text-right">{u.closet_items}</td>
                  <td className="py-2.5 pl-4 text-right"><GrantPromoButton userId={u.id} premium={u.premium} /></td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr><td colSpan={8} className="py-6 text-center text-[var(--wo-muted)]">No users yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
