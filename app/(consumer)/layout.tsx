import "@/components/ds/tokens/tokens.css";
import { ConsumerNav } from "@/components/ConsumerNav";

// Consumer webapp shell (app.whichoutfit.app). Separate from the admin
// dashboard's (dash) layout — no admin nav, no service-role data.
export default function ConsumerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100%", background: "var(--wo-bg, #f5f7fb)" }}>
      <ConsumerNav />
      {children}
    </div>
  );
}
