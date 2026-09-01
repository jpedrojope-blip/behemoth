export type NavItem = {
  href: string;
  label: string;
  icon: "dashboard" | "calendar" | "users" | "meeting" | "wallet" | "settings" | "help";
  section: "workspace" | "conta";
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Início", icon: "dashboard", section: "workspace" },
  { href: "/calendario", label: "Calendário", icon: "calendar", section: "workspace" },
  { href: "/equipe", label: "Clientes ativos", icon: "users", section: "workspace" },
  { href: "/reunioes", label: "Sala de Reunião", icon: "meeting", section: "workspace" },
  { href: "/financeiro", label: "Relatório", icon: "wallet", section: "workspace" },
  { href: "/ajuda", label: "Help center", icon: "help", section: "conta" },
  { href: "/configuracoes", label: "Configurações", icon: "settings", section: "conta" },
];

export function findNavItem(pathname: string) {
  if (pathname === "/") return NAV_ITEMS[0];
  return NAV_ITEMS.find((item) => item.href !== "/" && pathname.startsWith(item.href));
}
