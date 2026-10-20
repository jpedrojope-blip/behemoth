"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppSelect } from "@/components/ui/app-select";
import {
  Bell,
  Check,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Crown,
  FileText,
  LayoutDashboard,
  KanbanSquare,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
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
  kanban: KanbanSquare,
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

const PLANS = [
  { name: "Basic", description: "Para organizar a operação" },
  { name: "Pro", description: "Para acompanhar o negócio todo" },
  { name: "Enterprise", description: "Para times e operações maiores" },
];

type ShellData = { company: Company; openActionItems: number };
type SessionUser = { id: string; email: string; name: string; avatarUrl: string | null };
type SessionPayload = { authenticated: boolean; user: SessionUser | null };
type ColorTheme = "light" | "dark";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<ColorTheme>("light");
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === "undefined") return 264;
    const saved = Number(window.localStorage.getItem("behemoth-sidebar-width"));
    return saved >= 220 && saved <= 380 ? saved : 264;
  });
  const [authReady, setAuthReady] = useState(pathname === "/login");
  const [shell, setShell] = useState<ShellData | null>(null);
  const [profile, setProfile] = useState<SessionUser | null>(null);
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [updatingPlan, setUpdatingPlan] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const dataVersion = useDataVersion();

  useAutoRevalidate();

  useEffect(() => {
    const storageKey = "behemoth-theme";
    const savedTheme = window.localStorage.getItem(storageKey);
    const initialTheme: ColorTheme = savedTheme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = initialTheme;
    setTheme(initialTheme);
  }, []);

  useEffect(() => {
    if (pathname === "/login") return;
    let active = true;
    apiFetch<SessionPayload>("/api/auth/session")
      .then((session) => {
        if (!active) return;
        if (!session.authenticated) window.location.replace("/login");
        else {
          setProfile(session.user);
          setAuthReady(true);
        }
      })
      .catch(() => window.location.replace("/login"));
    return () => { active = false; };
  }, [pathname, dataVersion]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setPlanPickerOpen(false);
      mainRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  function resizeSidebar(event: React.PointerEvent<HTMLDivElement>) {
    const move = (moveEvent: PointerEvent) => {
      const next = Math.min(380, Math.max(220, moveEvent.clientX));
      setSidebarWidth(next);
      window.localStorage.setItem("behemoth-sidebar-width", String(next));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

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

  function navigateFromSidebar() {
    close();
    setPlanPickerOpen(false);
  }

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem("behemoth-theme", nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    setTheme(nextTheme);
  };

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.replace("/login");
  }

  if (pathname === "/login") return <ToastProvider>{children}</ToastProvider>;
  if (!authReady) return <ToastProvider><div className="auth-loading">Carregando seu workspace...</div></ToastProvider>;

  async function patchCompany(body: Partial<Company>) {
    try {
      const payload = await apiFetch<{ company: Company }>("/api/settings", { method: "PATCH", body: JSON.stringify(body) });
      setShell((currentShell) => currentShell ? { ...currentShell, company: payload.company } : currentShell);
      return true;
    } catch {
      return false;
    }
  }

  async function selectPlan(plan: string) {
    if (company?.plan === plan) {
      setPlanPickerOpen(false);
      return;
    }
    setUpdatingPlan(plan);
    const updated = await patchCompany({ plan });
    setUpdatingPlan(null);
    if (updated) setPlanPickerOpen(false);
  }

  return (
    <ToastProvider>
      <div className="app-shell" style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}>
        <aside className={`sidebar ${menuOpen ? "open" : ""}`} aria-label="Menu lateral">
          <Link href="/" className="sidebar-brand" onClick={navigateFromSidebar} aria-label="Behemoth — Início">
            <svg
              className="sidebar-brand-mark"
              viewBox="0 0 48 48"
              fill="none"
              aria-hidden="true"
            >
              <g stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M24 5 42 15.5 24 26 6 15.5 24 5Z" />
                <path d="M6 15.5v6.8l18 10.4 18-10.4v-6.8" />
                <path d="M6 22.3v6.8l18 10.4 18-10.4v-6.8" />
              </g>
            </svg>
          </Link>
          <Link href="/configuracoes" className="sidebar-user" onClick={navigateFromSidebar}>
            <div className="avatar">
              {profile?.avatarUrl
                ? <img src={profile.avatarUrl} alt={`Foto de perfil de ${profile.name}`} />
                : initials(profile?.name ?? company?.ownerName ?? "")}
            </div>
            <div>
              <strong>{profile?.name ?? company?.ownerName ?? "—"}</strong>
              <small>Plano {company?.plan ?? "—"}</small>
            </div>
          </Link>

          <nav aria-label="Navegação principal">
            {NAV_ITEMS.filter((item) => item.section === "workspace").map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${current?.href === item.href ? "active" : ""}`}
                  aria-label={item.label}
                  aria-current={current?.href === item.href ? "page" : undefined}
                  onClick={navigateFromSidebar}
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

          <nav aria-label="Conta">
            {NAV_ITEMS.filter((item) => item.section === "conta").map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${current?.href === item.href ? "active" : ""}`}
                  aria-label={item.label}
                  aria-current={current?.href === item.href ? "page" : undefined}
                  onClick={navigateFromSidebar}
                >
                  <Icon size={19} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            className="nav-item theme-toggle"
            onClick={toggleTheme}
            aria-label={`Ativar modo ${theme === "dark" ? "claro" : "escuro"}`}
            aria-pressed={theme === "dark"}
            title={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
          >
            {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            <span>{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
          </button>

          <div className="sidebar-bottom">
            <div className="upgrade-card">
              <div className="upgrade-head">
                <strong>Seu plano</strong>
              </div>
              <p>Plano {company?.plan ?? "Basic"} · veja as opções disponíveis</p>
              <button type="button" onClick={() => setPlanPickerOpen(true)} aria-label="Ver planos" title="Ver planos">
                <TrendingUp size={18} aria-hidden="true" />
                <span>Ver Planos</span>
              </button>
            </div>

            <div className="niche-card compact-niche">
              <strong>Nicho</strong>
              <AppSelect
                value={company?.niche ?? ""}
                onChange={(event) => void patchCompany({ niche: event.target.value })}
                aria-label="Nicho da empresa"
              >
                <option value="">Selecionar nicho</option>
                {NICHES.map((niche) => (
                  <option key={niche} value={niche}>
                    {niche}
                  </option>
                ))}
              </AppSelect>
            </div>
          </div>
          <div className="sidebar-resizer" onPointerDown={resizeSidebar} role="separator" aria-label="Redimensionar menu lateral" />
        </aside>

        {menuOpen && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={close} />}

        <main ref={mainRef} className="main-content" tabIndex={-1}>
          <header className="topbar">
            <button className="mobile-menu" onClick={() => setMenuOpen((open) => !open)} aria-label="Menu">
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <div className="brand-context">
              <span className="brand-tagline">CLAREZA PARA DECIDIR</span>
            </div>

            <div className="plan-control">
              <button
                type="button"
                className="plan-trigger"
                aria-haspopup="dialog"
                aria-expanded={planPickerOpen}
                onClick={() => setPlanPickerOpen((open) => !open)}
              >
                <Crown size={15} aria-hidden="true" />
                <span><small>Seu plano</small><strong>Plano {company?.plan ?? "Basic"}</strong></span>
                <ChevronDown size={15} aria-hidden="true" />
              </button>
              {planPickerOpen && (
                <section className="plan-menu" role="dialog" aria-label="Escolha seu plano">
                  <div className="plan-menu-head">
                    <div>
                      <p>PLANOS BEHEMOTH</p>
                      <strong>Escolha como sua operação evolui</strong>
                    </div>
                    <button type="button" aria-label="Fechar planos" onClick={() => setPlanPickerOpen(false)}><X size={16} /></button>
                  </div>
                  <div className="plan-options">
                    {PLANS.map((plan) => {
                      const selected = company?.plan === plan.name;
                      const isUpdating = updatingPlan === plan.name;
                      return (
                        <button
                          type="button"
                          key={plan.name}
                          className={`plan-option ${selected ? "selected" : ""}`}
                          onClick={() => void selectPlan(plan.name)}
                          disabled={Boolean(updatingPlan)}
                        >
                          <span className="plan-option-icon">{selected ? <Check size={14} /> : <Crown size={14} />}</span>
                          <span><strong>Plano {plan.name}</strong><small>{isUpdating ? "Atualizando plano..." : plan.description}</small></span>
                          {selected && <em>Atual</em>}
                        </button>
                      );
                    })}
                  </div>
                  <Link href="/configuracoes#plan" onClick={navigateFromSidebar}>Gerenciar dados do plano</Link>
                </section>
              )}
            </div>

            <div className="top-actions">
              <Link className="icon-btn" href="/financeiro" aria-label="Buscar lançamentos">
                <Search size={18} />
              </Link>
              <Link className="icon-btn" href="/reunioes" aria-label="Pendências">
                <Bell size={18} />
                {!!shell?.openActionItems && <em>{shell.openActionItems}</em>}
              </Link>
              <Link className="user-chip" href="/configuracoes" onClick={navigateFromSidebar}>
                <div className="avatar">
                  {profile?.avatarUrl
                    ? <img src={profile.avatarUrl} alt={`Foto de perfil de ${profile.name}`} />
                    : initials(profile?.name ?? company?.ownerName ?? "Behemoth")}
                </div>
                <div>
                  <strong>{profile?.name ?? company?.ownerName ?? "Workspace"}</strong>
                  <small>{profile?.email ?? current?.label ?? "Behemoth"}</small>
                </div>
                <ChevronDown size={15} />
              </Link>
              <button className="logout-button" onClick={logout} title="Sair">Sair</button>
            </div>
          </header>

          <div className="app-route" key={pathname}>{children}</div>

          <footer className="app-footer">
            © {new Date().getFullYear()} Behemoth. Todos os direitos reservados.
          </footer>
        </main>
      </div>
    </ToastProvider>
  );
}
