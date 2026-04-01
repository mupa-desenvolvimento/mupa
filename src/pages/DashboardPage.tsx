import { motion } from "framer-motion";
import {
  Package,
  Image,
  CheckCircle,
  TrendingDown,
  RefreshCw,
  Clock,
} from "lucide-react";
import { useStats } from "@/hooks/useStats";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 0, y: 0 },
};

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function DashboardPage() {
  const { data: stats, isLoading } = useStats();
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

  const imgProgress = stats
    ? stats.totalProdutos > 0
      ? Math.round((stats.comImagem / stats.totalProdutos) * 100)
      : 0
    : 0;

  const pieData = [
    { name: "Com imagem", value: stats?.comImagem ?? 0, color: "hsl(150, 60%, 40%)" },
    { name: "Sem imagem", value: stats?.semImagem ?? 0, color: "hsl(220, 15%, 85%)" },
  ];

  const catData = (stats?.topCategorias ?? []).map((c) => ({
    name: c.nome ?? c.id,
    total: c.total_produtos ?? 0,
  }));

  const statCards = [
    {
      label: "Total Produtos",
      value: stats?.totalProdutos ?? 0,
      icon: Package,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Imagens Baixadas",
      value: stats?.comImagem ?? 0,
      icon: Image,
      color: "text-info",
      bg: "bg-info/10",
    },
    {
      label: "Disponíveis",
      value: stats?.disponiveis ?? 0,
      icon: CheckCircle,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Sem Imagem",
      value: stats?.semImagem ?? 0,
      icon: TrendingDown,
      color: "text-warning",
      bg: "bg-warning/10",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Visão geral do catálogo de produtos Rissul
          </p>
        </div>
        <Button
          onClick={handleSync}
          disabled={syncing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizando..." : "Sincronizar Agora"}
        </Button>
      </div>

      {/* Stat Cards */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {statCards.map((stat) => (
          <motion.div key={stat.label} variants={item} className="stat-card">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
              <div className={`${stat.bg} rounded-lg p-2`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </div>
            <p className="mt-3 font-display text-3xl font-bold">
              {isLoading ? "—" : stat.value.toLocaleString("pt-BR")}
            </p>
          </motion.div>
        ))}
      </motion.div>

      {/* Image Progress */}
      <motion.div
        className="stat-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold">Progresso de Imagens</h3>
          <span className="text-sm font-medium text-muted-foreground">{imgProgress}%</span>
        </div>
        <Progress value={imgProgress} className="h-2.5" />
        <p className="text-xs text-muted-foreground mt-2">
          {stats?.comImagem ?? 0} de {stats?.totalProdutos ?? 0} imagens baixadas
        </p>
      </motion.div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top Categories */}
        <motion.div
          className="stat-card"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h3 className="font-display font-semibold mb-4">Top 10 Categorias</h3>
          {catData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={catData} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                <Tooltip />
                <Bar dataKey="total" fill="hsl(150, 60%, 40%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
              Nenhum dado disponível. Sincronize para popular.
            </div>
          )}
        </motion.div>

        {/* Image Pie */}
        <motion.div
          className="stat-card"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <h3 className="font-display font-semibold mb-4">Status das Imagens</h3>
          {stats && stats.totalProdutos > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
              Nenhum dado disponível.
            </div>
          )}
        </motion.div>
      </div>

      {/* Last sync */}
      {stats?.lastSync && (
        <motion.div
          className="stat-card flex items-center gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <div className="bg-primary/10 rounded-lg p-2.5">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">Última sincronização</p>
            <p className="text-xs text-muted-foreground">
              {new Date(stats.lastSync.iniciado_em!).toLocaleString("pt-BR")} —{" "}
              <span
                className={
                  stats.lastSync.status === "success"
                    ? "text-success"
                    : stats.lastSync.status === "error"
                    ? "text-destructive"
                    : "text-warning"
                }
              >
                {stats.lastSync.status}
              </span>{" "}
              — {stats.lastSync.total_produtos} produtos
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
