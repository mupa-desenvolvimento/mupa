import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  RefreshCw,
  Image,
  FileText,
  Zap,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/catalogo", icon: Package, label: "Catálogo" },
  { to: "/sync", icon: RefreshCw, label: "Sincronização" },
  { to: "/imagens", icon: Image, label: "Imagens" },
  { to: "/docs", icon: FileText, label: "API Docs" },
];

export default function AppSidebar() {
  const location = useLocation();

  return (
    <aside className="sidebar-gradient fixed left-0 top-0 h-screen w-64 flex flex-col z-50">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6 border-b border-sidebar-border">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary">
          <Zap className="h-5 w-5 text-sidebar-primary-foreground" />
        </div>
        <div>
          <h1 className="font-display text-lg font-bold text-sidebar-foreground">Mupa</h1>
          <p className="text-xs text-sidebar-foreground/60">Product Manager</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive =
            item.to === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              <item.icon className="h-4.5 w-4.5 shrink-0" size={18} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-sidebar-border">
        <p className="text-xs text-sidebar-foreground/40">
          Catálogo Rissul v1.0
        </p>
      </div>
    </aside>
  );
}
