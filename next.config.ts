import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Referral links (whichoutfit.app/r/<CODE>) → the static redeem page in public/.
  // The page reads the code from the path or ?code=. `/r` and `/r/?code=` also work.
  async rewrites() {
    return [
      { source: "/r", destination: "/r.html" },
      { source: "/r/:code", destination: "/r.html" },
    ];
  },
};

export default nextConfig;
