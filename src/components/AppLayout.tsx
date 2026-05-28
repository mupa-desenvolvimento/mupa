import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import MobileBottomNav from "./MobileBottomNav";

export default function AppLayout() {
  return (
    <div className="flex min-h-screen">
      {/* Mobile top bar (brand only) */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-center px-4 h-14 bg-sidebar border-b border-sidebar-border">
        <span className="font-display font-bold text-sidebar-foreground">Mupa</span>
      </div>

      {/* Sidebar: desktop only */}
      <div className="hidden md:block">
        <AppSidebar />
      </div>

      <main className="flex-1 md:ml-64 p-4 md:p-8 pt-20 md:pt-8 pb-24 md:pb-8 overflow-y-auto w-full">
        <Outlet />
      </main>

      <MobileBottomNav />
    </div>
  );
}
