import "@/components/ds/tokens/tokens.css";
import { ConsumerNav } from "@/components/ConsumerNav";
import { ComingSoon } from "@/components/ComingSoon";
import { consumerWebappEnabled } from "@/lib/flags";

// Consumer webapp shell (app.whichoutfit.app). Separate from the admin
// dashboard's (dash) layout — no admin nav, no service-role data.
//
// While the focus is on iOS the whole surface is gated behind
// CONSUMER_WEBAPP_ENABLED (lib/flags.ts): every consumer route renders the
// ComingSoon page instead. The pages themselves stay in the repo, building
// and working, for the cross-platform build-out.
export default function ConsumerLayout({ children }: { children: React.ReactNode }) {
  if (!consumerWebappEnabled()) return <ComingSoon />;
  return (
    <div style={{ minHeight: "100%", background: "var(--wo-bg, #f5f7fb)" }}>
      <ConsumerNav />
      {children}
    </div>
  );
}
