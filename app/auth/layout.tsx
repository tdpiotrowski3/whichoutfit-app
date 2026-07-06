import { ComingSoon } from "@/components/ComingSoon";
import { consumerWebappEnabled } from "@/lib/flags";

// /auth/callback is the consumer webapp's OAuth return URL. It lives outside
// the (consumer) route group, so gate it here with the same flag — a hidden
// webapp shouldn't be enterable through its sign-in redirect. (The iOS app
// signs in via its own URL scheme and never lands here.)
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  if (!consumerWebappEnabled()) return <ComingSoon />;
  return children;
}
