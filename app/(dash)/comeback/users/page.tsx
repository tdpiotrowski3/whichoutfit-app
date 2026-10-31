import { Card } from "@/components/ui";
import { NotConfigured } from "@/components/comeback/Bits";
import { getComebackUsers } from "@/lib/comeback/data";

export const dynamic = "force-dynamic";

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" }) : "—");

export default async function ComebackUsersPage() {
  let users;
  try { users = await getComebackUsers(); } catch { return <NotConfigured what="users" />; }
  const pro = users.filter((u) => u.pro).length;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-[var(--wo-muted)]">{users.length} accounts · {pro} Pro. Sorted by last active. Features counts start Oct 30, 2026.</p>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--wo-border)] text-left text-xs uppercase tracking-wide text-[var(--wo-muted)]">
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Tier</th>
                <th className="py-2 pr-4 font-medium">Path</th>
                <th className="py-2 pr-4 font-medium">Sport</th>
                <th className="py-2 pr-4 font-medium">Signed up</th>
                <th className="py-2 pr-4 font-medium">Last active</th>
                <th className="py-2 pr-4 font-medium text-right">Sessions</th>
                <th className="py-2 pr-4 font-medium text-right">AI</th>
                <th className="py-2 pl-4 font-medium text-right">Features</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[var(--wo-border)] last:border-0">
                  <td className="py-2.5 pr-4 font-medium">{u.email ?? <span className="text-[var(--wo-muted)]">no email</span>}</td>
                  <td className="py-2.5 pr-4">
                    {u.pro ? <span className="rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: "var(--wo-green)" }}>Pro{u.platform ? " · " + (u.platform === "ios" ? "iOS" : "Play") : ""}</span>
                      : <span className="rounded-full bg-[var(--wo-bg)] px-2 py-0.5 text-xs font-medium text-[var(--wo-muted)]">Free</span>}
                  </td>
                  <td className="py-2.5 pr-4 text-[var(--wo-muted)]">{u.path}{u.area ? " · " + u.area : ""}</td>
                  <td className="py-2.5 pr-4">{u.sport}{u.goal ? <span className="text-[var(--wo-muted)]"> · {u.goal}</span> : null}</td>
                  <td className="py-2.5 pr-4 text-[var(--wo-muted)]">{fmt(u.created_at)}</td>
                  <td className="py-2.5 pr-4 text-[var(--wo-muted)]">{fmt(u.last_active)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{u.sessions}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{u.ai}</td>
                  <td className="py-2.5 pl-4 text-right tabular-nums">{u.features}<span className="text-[var(--wo-muted)]"> · {u.uses} uses</span></td>
                </tr>
              ))}
              {users.length === 0 ? <tr><td colSpan={9} className="py-6 text-center text-[var(--wo-muted)]">No accounts yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
