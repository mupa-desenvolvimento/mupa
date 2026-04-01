import { useSyncLogs } from "@/hooks/useSyncLogs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, Play, Square, CheckCircle, XCircle, Clock } from "lucide-react";
import { useState } from "react";

export default function SyncPage() {
  const { data: logs, isLoading } = useSyncLogs();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/sync-produtos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (e) {
      console.error("Sync error:", e);
    } finally {
      setSyncing(false);
    }
  };

  const currentSync = logs?.find((l) => l.status === "running");

  const statusIcon = (s: string | null) => {
    switch (s) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-success" />;
      case "error":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "running":
        return <RefreshCw className="h-4 w-4 text-info animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Sincronização</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie a extração de dados da API Rissul
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncing} className="gap-2">
          {syncing ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" /> Sincronizando...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" /> Iniciar Sync
            </>
          )}
        </Button>
      </div>

      {/* Active sync */}
      {currentSync && (
        <div className="stat-card border-info/30">
          <div className="flex items-center gap-3 mb-3">
            <RefreshCw className="h-5 w-5 text-info animate-spin" />
            <h3 className="font-display font-semibold">Sincronização em andamento</h3>
          </div>
          <Progress value={50} className="h-2.5 mb-2" />
          <p className="text-sm text-muted-foreground">
            {currentSync.total_produtos ?? 0} produtos processados — {currentSync.produtos_novos ?? 0} novos,{" "}
            {currentSync.produtos_atualizados ?? 0} atualizados
          </p>
        </div>
      )}

      {/* Logs Table */}
      <div className="stat-card">
        <h3 className="font-display font-semibold mb-4">Histórico de Sincronizações</h3>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : logs && logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Início</th>
                  <th className="pb-2 pr-4">Fim</th>
                  <th className="pb-2 pr-4">Produtos</th>
                  <th className="pb-2 pr-4">Novos</th>
                  <th className="pb-2 pr-4">Atualizados</th>
                  <th className="pb-2">Imagens</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b last:border-0">
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        {statusIcon(log.status)}
                        <span className="capitalize">{log.status}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">
                      {log.iniciado_em ? new Date(log.iniciado_em).toLocaleString("pt-BR") : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">
                      {log.finalizado_em ? new Date(log.finalizado_em).toLocaleString("pt-BR") : "—"}
                    </td>
                    <td className="py-2.5 pr-4 font-medium">{log.total_produtos ?? 0}</td>
                    <td className="py-2.5 pr-4 text-success">{log.produtos_novos ?? 0}</td>
                    <td className="py-2.5 pr-4 text-info">{log.produtos_atualizados ?? 0}</td>
                    <td className="py-2.5">{log.imagens_baixadas ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma sincronização realizada ainda.
          </p>
        )}
      </div>
    </div>
  );
}
