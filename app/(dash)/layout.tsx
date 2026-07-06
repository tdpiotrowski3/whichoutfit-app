import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/session";
import { Nav } from "@/components/Nav";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthed())) redirect("/login");
  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
