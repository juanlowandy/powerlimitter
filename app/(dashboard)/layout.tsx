// Kerangka semua halaman setelah login: sidebar + topbar.
// Cek login dilakukan di server; kalau belum login langsung diarahkan ke /login.
import { redirect } from "next/navigation";
import { currentUser, toUser } from "@/lib/auth";
import { SessionProvider } from "@/lib/session";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <SessionProvider user={toUser(user)}>
      <main className="dashboard">
        <Sidebar />
        <section className="main-area">
          <Topbar />
          <div className="content">{children}</div>
        </section>
      </main>
    </SessionProvider>
  );
}
