import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu, X } from "lucide-react";
import AppSidebar from "./AppSidebar";

export default function AppLayout() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 h-14 bg-sidebar border-b border-sidebar-border">
        <span className="font-display font-bold text-sidebar-foreground">Mupa</span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="p-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent"
          aria-label="Menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setOpen(false)}
        />
      )}

      <AppSidebar mobileOpen={open} onNavigate={() => setOpen(false)} />

      <main className="flex-1 md:ml-64 p-4 md:p-8 pt-20 md:pt-8 overflow-y-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}
