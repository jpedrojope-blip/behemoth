"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  FileText,
  LayoutDashboard,
  Menu,
  Search,
  Settings,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { apiFetch, useAutoRevalidate, useDataVersion } from "@/lib/client";
import { initials } from "@/lib/format";
import { findNavItem, NAV_ITEMS, type NavItem } from "@/lib/nav";
import type { Company } from "@/lib/types";
import { ToastProvider } from "@/components/ui/toast";

const ICONS: Record<NavItem["icon"], typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  calendar: CalendarDays,
  users: Users,
  meeting: FileText,
  wallet: WalletCards,
  settings: Settings,
  help: CircleHelp,
};

type ShellData = { company: Company; openActionItems: number };

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [shell, setShell] = useState<ShellData | null>(null);
  const dataVersion = useDataVersion();

  useAutoRevalidate();

  useEffect(() => {
    let active = true;
    apiFetch<ShellData>("/api/overview?period=mes")
      .then((payload) => {
        if (active) setShell({ company: payload.company, openActionItems: payload.openActionItems });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [pathname, dataVersion]);

  const current = findNavItem(pathname);
  const company = shell?.company;

  return (
    <ToastProvider>
      <div className="app-shell">
        <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
          <Link href="/" className="brand">
            <div className="brand-mark">B</div>
            <span>behemoth</span>
          </Link>

          <Link href="/configuracoes" className="workspace" onClick={() => setMenuOpen(false)}>
            <div className="avatar">{initials(company?.name ?? "Behemoth")}</div>
            <div>
              <strong>{company?.name ?? "Carregando..."}</strong>
              <small>{company ? `Plano ${company.plan}` : "—"}</small>
            </div>
            <ChevronDown size={15} />
          </Link>

          <nav>
            <p className="nav-label">WORKSPACE</p>
            {NAV_ITEMS.filter((item) => item.section === "workspace").map((item) => {
              const Icon = ICONS[item.icon];
              const active = current?.href === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${active ? "active" : ""}`}
                  onClick={() => setMenuOpen(false)}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                  {item.href === "/reunioes" && !!shell?.openActionItems && (
                    <b className="nav-badge">{shell.openActionItems}</b>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="sidebar-bottom">
            <p className="nav-label">CONTA</p>
            {NAV_ITEMS.filter((item) => item.section === "conta").map((item) => {
              const Icon = ICONS[item.icon];
              const active = current?.href === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${active ? "active" : ""}`}
                  onClick={() => setMenuOpen(false)}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <Link href="/configuracoes" className="profile" onClick={() => setMenuOpen(false)}>
              <div className="avatar">{initials(company?.ownerName ?? "")}</div>
              <div>
                <strong>{company?.ownerName ?? "—"}</strong>
                <small>{roleLabel(company?.ownerRole)}</small>
              </div>
              <ChevronDown size={15} />
            </Link>
          </div>
        </aside>

        {menuOpen && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}

        <main className="main-content">
          <header className="topbar">
            <button className="mobile-menu" onClick={() => setMenuOpen((open) => !open)} aria-label="Menu">
              {menuOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
            <div className="breadcrumb">
              <span>{current?.label ?? "Behemoth"}</span>
              <i>/</i>
              <strong>{company?.name ?? "Workspace"}</strong>
            </div>
            <div className="top-actions">
              <Link className="icon-btn" href="/financeiro" aria-label="Buscar lançamentos">
                <Search size={18} />
              </Link>
              <Link className="icon-btn notification" href="/reunioes" aria-label="Pendências">
                <Bell size={18} />
                {!!shell?.openActionItems && <em />}
              </Link>
              <Link className="help-btn" href="/ajuda">
                <CircleHelp size={16} /> Ajuda
              </Link>
            </div>
          </header>
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}

function roleLabel(role?: Company["ownerRole"]) {
  if (role === "ADMIN") return "Administrador";
  if (role === "MANAGER") return "Gestor";
  if (role === "MEMBER") return "Membro";
  return "—";
}
