import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/session";
import { Nav } from "@/components/Nav";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthed())) redirect("/login");
  return (
    <div className="md:flex">
      <Nav />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</div>
      </main>
    </div>
  );
}
