import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Package,
  RefreshCw,
  Image,
  FileText,
  Monitor,
  Zap,
  LogOut,
  Smartphone,
  DollarSign,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { PWA_UPDATE_EVENT, applyPwaUpdate } from "@/lib/pwaRegister";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/catalogo", icon: Package, label: "Catálogo" },
  { to: "/sync", icon: RefreshCw, label: "Sincronização" },
  { to: "/imagens", icon: Image, label: "Imagens" },
  { to: "/docs", icon: FileText, label: "API Docs" },
  { to: "/terminal-media", icon: Monitor, label: "Mídia Terminal" },
  { to: "/dispositivos", icon: Smartphone, label: "Dispositivos" },
  { to: "/preco-mapeamento", icon: DollarSign, label: "Mapeamento Preços" },
];

export default function AppSidebar() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [pwaUpdatePending, setPwaUpdatePending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const onPwa = () => setPwaUpdatePending(true);
    window.addEventListener(PWA_UPDATE_EVENT, onPwa);
    return () => window.removeEventListener(PWA_UPDATE_EVENT, onPwa);
  }, []);

  const handleAtualizarReceber = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries();
      toast.success("Dados atualizados do servidor.");
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        await reg?.update();
        if (reg?.waiting || pwaUpdatePending) {
          toast.info("A instalar nova versão da aplicação…");
          await applyPwaUpdate();
          setPwaUpdatePending(false);
        }
      } catch {
        /* SW opcional (ex.: dev sem PWA) */
      }
    } catch {
      toast.error("Não foi possível atualizar.");
    } finally {
      setRefreshing(false);
    }
  };

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
      <div className="px-6 py-4 border-t border-sidebar-border space-y-3">
        <Button
          type="button"
          variant="secondary"
          className="w-full justify-center gap-2 bg-sidebar-accent/80 text-sidebar-foreground hover:bg-sidebar-accent border border-sidebar-border"
          disabled={refreshing}
          onClick={handleAtualizarReceber}
        >
          <RefreshCw className={`h-4 w-4 shrink-0 ${refreshing ? "animate-spin" : ""}`} />
          {pwaUpdatePending ? "Atualizar e receber (nova versão)" : "Atualizar e receber"}
        </Button>
        {user && (
          <p className="text-xs text-sidebar-foreground/60 truncate">{user.email}</p>
        )}
        <button
          onClick={signOut}
          className="flex items-center gap-2 text-xs text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sair
        </button>
        <p className="text-xs text-sidebar-foreground/40">
          Catálogo Rissul v1.0
        </p>
      </div>
    </aside>
  );
}
