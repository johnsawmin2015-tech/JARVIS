import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { isDemoMode } from "@jarvis/database";
import { getSession } from "../../lib/auth";
import { LogoutButton } from "../../components/logout-button";

const navigation = [
  ["Command", "/"],
  ["Tasks", "/tasks"],
  ["Projects", "/projects"],
  ["Memory", "/memory"],
  ["Approvals", "/approvals"],
  ["Activity", "/activity"],
  ["Artifacts", "/artifacts"],
  ["Usage", "/usage"],
  ["Settings", "/settings"],
] as const;

export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await getSession();
  if (!session) redirect("/login");
  const demoMode = isDemoMode();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" />
          JARVIS
        </div>
        <nav className="nav" aria-label="Primary">
          {navigation.map(([label, href]) => (
            <Link href={href} key={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div style={{ marginTop: 28 }}>
          <LogoutButton />
        </div>
      </aside>
      <main className="main">
        {demoMode ? (
          <div className="demo-banner" role="status">
            <strong>Local demo mode</strong>
            <span>
              Process-local data only · resets when this server restarts · no external actions
            </span>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
