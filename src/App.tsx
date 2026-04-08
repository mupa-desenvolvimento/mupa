import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import CatalogoPage from "./pages/CatalogoPage";
import SyncPage from "./pages/SyncPage";
import ImagensPage from "./pages/ImagensPage";
import DocsPage from "./pages/DocsPage";
import TerminalMediaPage from "./pages/TerminalMediaPage";
import TerminalPage from "./pages/TerminalPage";
import DispositivosPage from "./pages/DispositivosPage";
import PrecoMapeamentoPage from "./pages/PrecoMapeamentoPage";
import NotFound from "./pages/NotFound";
import HomePage from "./pages/HomePage";
import DiagnosticPage from "./pages/DiagnosticPage";
import PWAHelpPage from "./pages/PWAHelpPage";
import MaintenanceControlPage from "./pages/MaintenanceControlPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Rota pública do PWA - página inicial */}
            <Route path="/" element={<HomePage />} />
            
            {/* Rota de diagnóstico PWA */}
            <Route path="/diagnostic" element={<DiagnosticPage />} />
            
            {/* Rota de ajuda PWA */}
            <Route path="/pwa-help" element={<PWAHelpPage />} />
            
            {/* Rota de controle de manutenção */}
            <Route path="/maintenance-control" element={<MaintenanceControlPage />} />
            
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/catalogo" element={<CatalogoPage />} />
              <Route path="/sync" element={<SyncPage />} />
              <Route path="/imagens" element={<ImagensPage />} />
              <Route path="/docs" element={<DocsPage />} />
              <Route path="/terminal-media" element={<TerminalMediaPage />} />
              <Route path="/dispositivos" element={<DispositivosPage />} />
              <Route path="/preco-mapeamento" element={<PrecoMapeamentoPage />} />
            </Route>
            <Route path="/terminal" element={<TerminalPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
