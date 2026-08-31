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
  TrendingUp,
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

const NICHES = [
  "Agência",
  "E-commerce",
  "Serviços",
  "SaaS",
  "Indústria",
  "Varejo",
  "Educação",
  "Saúde",
];

const PLANS = ["Basic", "Pro", "Enterprise"];

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
  const close = () => setMenuOpen(false);

  async function patchCompany(body: Partial<Company>) {
    try {
      await apiFetch("/api/settings", { method: "PATCH", body: JSON.stringify(body) });
    } catch {
      // o toast das páginas cobre o erro; aqui a revalidação devolve o valor anterior
    }
  }

  return (
    <ToastProvider>
      <div className="app-shell">
        <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
          <Link href="/configuracoes" className="sidebar-user" onClick={close}>
            <div className="avatar">{initials(company?.ownerName ?? "")}</div>
            <div>
              <strong>{company?.ownerName ?? "—"}</strong>
              <small>Plano {company?.plan ?? "—"}</small>
            </div>
          </Link>

          <nav>
            {NAV_ITEMS.filter((item) => item.section === "workspace").map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${current?.href === item.href ? "active" : ""}`}
                  onClick={close}
                >
                  <Icon size={19} />
                  <span>{item.label}</span>
                  {item.href === "/reunioes" && !!shell?.openActionItems && (
                    <b className="nav-badge">{shell.openActionItems}</b>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="sidebar-divider" />

          <nav>
            {NAV_ITEMS.filter((item) => item.section === "conta").map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${current?.href === item.href ? "active" : ""}`}
                  onClick={close}
                >
                  <Icon size={19} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="sidebar-bottom">
            <div className="niche-card">
              <strong>Seu Nicho</strong>
              <p>Selecione seu nicho de atuação</p>
              <select
                value={company?.niche ?? ""}
                onChange={(event) => patchCompany({ niche: event.target.value })}
                aria-label="Nicho da empresa"
              >
                <option value="">Selecionar nicho</option>
                {NICHES.map((niche) => (
                  <option key={niche} value={niche}>
                    {niche}
                  </option>
                ))}
              </select>
            </div>

            <div className="upgrade-card">
              <div className="upgrade-head">
                <strong>Upgrade de Plano</strong>
                <TrendingUp size={18} />
              </div>
              <p>Desbloqueie recursos exclusivos</p>
              <Link href="/configuracoes" onClick={close}>
                Ver Planos
              </Link>
            </div>
          </div>
        </aside>

        {menuOpen && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={close} />}

        <main className="main-content">
          <header className="topbar">
            <button className="mobile-menu" onClick={() => setMenuOpen((open) => !open)} aria-label="Menu">
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <Link href="/" className="brand">
              <div className="brand-mark">B</div>
              <span>Behemoth</span>
            </Link>

            <div className="plan-select">
              <select
                value={company?.plan ?? "Basic"}
                onChange={(event) => patchCompany({ plan: event.target.value })}
                aria-label="Plano"
              >
                {PLANS.map((plan) => (
                  <option key={plan} value={plan}>
                    Plano {plan}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} />
            </div>

            <div className="top-actions">
              <Link className="icon-btn" href="/financeiro" aria-label="Buscar lançamentos">
                <Search size={18} />
              </Link>
              <Link className="icon-btn" href="/reunioes" aria-label="Pendências">
                <Bell size={18} />
                {!!shell?.openActionItems && <em>{shell.openActionItems}</em>}
              </Link>
              <Link className="user-chip" href="/configuracoes">
                <div className="avatar">{initials(company?.name ?? "Behemoth")}</div>
                <div>
                  <strong>{company?.name ?? "Workspace"}</strong>
                  <small>{current?.label ?? "Behemoth"}</small>
                </div>
                <ChevronDown size={15} />
              </Link>
            </div>
          </header>

          {children}

          <footer className="app-footer">
            © {new Date().getFullYear()} Behemoth. Todos os direitos reservados.
          </footer>
        </main>
      </div>
    </ToastProvider>
  );
}
