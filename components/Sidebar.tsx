"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/session";

const MENU = [
  { href: "/", icon: "▦", label: "Overview" },
  { href: "/riwayat", icon: "↗", label: "Riwayat" },
  { href: "/tenant", icon: "▣", label: "Kelola Tenant", adminOnly: true },
  { href: "/akun", icon: "◉", label: "Akun Pengguna", adminOnly: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, isAdmin, logout } = useSession();
  const initials = user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <aside className="sidebar">
      <h2 className="brand">⚡<span className="brand-text"> Smart<span>Power</span></span></h2>
      <p className="nav-title">MENU UTAMA</p>
      <nav>
        {MENU.filter((m) => !m.adminOnly || isAdmin).map((m) => (
          <Link key={m.href} href={m.href} className={pathname === m.href ? "nav-link active" : "nav-link"}>
            <span className="nav-icon">{m.icon}</span>
            <span className="nav-label">{m.label}</span>
          </Link>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="avatar">{initials}</div>
        <div className="sidebar-user">
          <strong>{user.name}</strong>
          <small>{isAdmin ? "Administrator" : "Pemilik tenant"}</small>
        </div>
      </div>
      <button className="logout-button" onClick={logout}>
        <span className="nav-icon">⇥</span>
        <span className="nav-label">Keluar</span>
      </button>
    </aside>
  );
}
