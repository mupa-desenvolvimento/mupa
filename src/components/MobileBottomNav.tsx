import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  RefreshCw,
  Image as ImageIcon,
  Monitor,
  Smartphone,
  DollarSign,
  FileText,
  MoreHorizontal,
} from "lucide-react";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const primary = [
  { to: "/", icon: LayoutDashboard, label: "Início" },
  { to: "/catalogo", icon: Package, label: "Catálogo" },
  { to: "/sync", icon: RefreshCw, label: "Sync" },
  { to: "/dispositivos", icon: Smartphone, label: "Disp." },
];

const more = [
  { to: "/imagens", icon: ImageIcon, label: "Imagens" },
  { to: "/terminal-media", icon: Monitor, label: "Mídia Terminal" },
  { to: "/preco-mapeamento", icon: DollarSign, label: "Mapeamento Preços" },
  { to: "/docs", icon: FileText, label: "API Docs" },
];

export default function MobileBottomNav() {
  const [open, setOpen] = useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[11px] font-medium transition-colors ${
      isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-50 h-16 bg-card border-t border-border flex items-stretch"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {primary.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === "/"} className={linkClass}>
          <item.icon className="h-5 w-5" />
          <span>{item.label}</span>
        </NavLink>
      ))}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            <MoreHorizontal className="h-5 w-5" />
            <span>Mais</span>
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Mais opções</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-3 py-4">
            {more.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-border text-center ${
                    isActive
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "bg-card text-foreground hover:bg-muted"
                  }`
                }
              >
                <item.icon className="h-6 w-6" />
                <span className="text-xs font-medium leading-tight">{item.label}</span>
              </NavLink>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
