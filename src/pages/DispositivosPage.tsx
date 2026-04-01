import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Building2, Monitor, Users, Key, Plus, Trash2, Copy, QrCode, Globe, Settings, RefreshCw,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// ─── Types ───
interface Empresa {
  id: string;
  nome: string;
  slug: string;
  logo_url: string | null;
  ativo: boolean;
  criado_em: string;
}

interface Dispositivo {
  id: string;
  empresa_id: string | null;
  nome: string;
  codigo_ativacao: string;
  ativo: boolean;
  ativado_em: string | null;
  ultimo_acesso: string | null;
  criado_em: string;
}

interface EmpresaApiConfig {
  id: string;
  empresa_id: string;
  api_url: string;
  api_token: string | null;
  tipo_api: string;
  ativo: boolean;
}

// ─── Helpers ───
function generateCode(length = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ─── Main Page ───
export default function DispositivosPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("empresas");
  const [newEmpresa, setNewEmpresa] = useState("");
  const [newDispNome, setNewDispNome] = useState("");
  const [selectedEmpresa, setSelectedEmpresa] = useState<string | null>(null);
  const [showAddEmpresa, setShowAddEmpresa] = useState(false);
  const [showAddDisp, setShowAddDisp] = useState(false);

  // API config state
  const [apiUrl, setApiUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [apiTipo, setApiTipo] = useState("rest");

  // ── Queries ──
  const { data: empresas = [] } = useQuery({
    queryKey: ["empresas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas").select("*").order("nome");
      if (error) throw error;
      return data as Empresa[];
    },
  });

  const { data: dispositivos = [] } = useQuery({
    queryKey: ["dispositivos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dispositivos").select("*").order("criado_em", { ascending: false });
      if (error) throw error;
      return data as Dispositivo[];
    },
  });

  const { data: apiConfigs = [] } = useQuery({
    queryKey: ["empresa_api_config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("empresa_api_config").select("*");
      if (error) throw error;
      return data as EmpresaApiConfig[];
    },
  });

  // ── Mutations ──
  const addEmpresa = useMutation({
    mutationFn: async (nome: string) => {
      const { error } = await supabase.from("empresas").insert({ nome, slug: slugify(nome) });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["empresas"] });
      setNewEmpresa("");
      setShowAddEmpresa(false);
      toast.success("Empresa cadastrada!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleEmpresa = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("empresas").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["empresas"] }),
  });

  const deleteEmpresa = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("empresas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["empresas"] });
      toast.success("Empresa removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addDispositivo = useMutation({
    mutationFn: async ({ nome, empresa_id }: { nome: string; empresa_id: string | null }) => {
      const codigo = generateCode();
      const { error } = await supabase.from("dispositivos").insert({
        nome,
        empresa_id,
        codigo_ativacao: codigo,
      });
      if (error) throw error;
      return codigo;
    },
    onSuccess: (codigo) => {
      qc.invalidateQueries({ queryKey: ["dispositivos"] });
      setNewDispNome("");
      setShowAddDisp(false);
      toast.success(`Dispositivo criado! Código: ${codigo}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteDispositivo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dispositivos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispositivos"] });
      toast.success("Dispositivo removido");
    },
  });

  const toggleDispositivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("dispositivos").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dispositivos"] }),
  });

  const saveApiConfig = useMutation({
    mutationFn: async ({ empresa_id, api_url, api_token, tipo_api }: { empresa_id: string; api_url: string; api_token: string; tipo_api: string }) => {
      const existing = apiConfigs.find((c) => c.empresa_id === empresa_id);
      if (existing) {
        const { error } = await supabase.from("empresa_api_config").update({ api_url, api_token, tipo_api }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("empresa_api_config").insert({ empresa_id, api_url, api_token, tipo_api });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["empresa_api_config"] });
      toast.success("Configuração de API salva!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  const getEmpresaNome = (id: string | null) => empresas.find((e) => e.id === id)?.nome ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dispositivos & Empresas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie empresas, terminais e configurações de API
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="empresas" className="gap-2">
            <Building2 className="h-4 w-4" /> Empresas
          </TabsTrigger>
          <TabsTrigger value="dispositivos" className="gap-2">
            <Monitor className="h-4 w-4" /> Dispositivos
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-2">
            <Globe className="h-4 w-4" /> API Config
          </TabsTrigger>
        </TabsList>

        {/* ═══ EMPRESAS ═══ */}
        <TabsContent value="empresas" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={showAddEmpresa} onOpenChange={setShowAddEmpresa}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" /> Nova Empresa</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Cadastrar Empresa</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <Input
                    placeholder="Nome da empresa"
                    value={newEmpresa}
                    onChange={(e) => setNewEmpresa(e.target.value)}
                  />
                  <Button
                    className="w-full"
                    disabled={!newEmpresa.trim()}
                    onClick={() => addEmpresa.mutate(newEmpresa.trim())}
                  >
                    Cadastrar
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Dispositivos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {empresas.map((emp) => {
                  const dispCount = dispositivos.filter((d) => d.empresa_id === emp.id).length;
                  return (
                    <TableRow key={emp.id}>
                      <TableCell className="font-medium">{emp.nome}</TableCell>
                      <TableCell className="text-muted-foreground text-xs font-mono">{emp.slug}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{dispCount}</Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={emp.ativo}
                          onCheckedChange={(v) => toggleEmpresa.mutate({ id: emp.id, ativo: v })}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => {
                            if (confirm("Remover esta empresa e todos os dados relacionados?")) {
                              deleteEmpresa.mutate(emp.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {empresas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nenhuma empresa cadastrada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ═══ DISPOSITIVOS ═══ */}
        <TabsContent value="dispositivos" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={showAddDisp} onOpenChange={setShowAddDisp}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" /> Novo Dispositivo</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Cadastrar Dispositivo</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <Input
                    placeholder="Nome do dispositivo (ex: Terminal Loja 01)"
                    value={newDispNome}
                    onChange={(e) => setNewDispNome(e.target.value)}
                  />
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Empresa (opcional)</label>
                    <select
                      className="w-full border rounded px-3 py-2 text-sm bg-background"
                      value={selectedEmpresa ?? ""}
                      onChange={(e) => setSelectedEmpresa(e.target.value || null)}
                    >
                      <option value="">Sem empresa</option>
                      {empresas.filter((e) => e.ativo).map((e) => (
                        <option key={e.id} value={e.id}>{e.nome}</option>
                      ))}
                    </select>
                  </div>
                  <Button
                    className="w-full"
                    disabled={!newDispNome.trim()}
                    onClick={() => addDispositivo.mutate({ nome: newDispNome.trim(), empresa_id: selectedEmpresa })}
                  >
                    Criar Dispositivo
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Código de Ativação</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Último Acesso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dispositivos.map((disp) => (
                  <TableRow key={disp.id}>
                    <TableCell className="font-medium">{disp.nome}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {getEmpresaNome(disp.empresa_id)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
                          {disp.codigo_ativacao}
                        </code>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(disp.codigo_ativacao)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => {
                            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(disp.codigo_ativacao)}`;
                            window.open(qrUrl, "_blank");
                          }}
                        >
                          <QrCode className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={disp.ativo}
                          onCheckedChange={(v) => toggleDispositivo.mutate({ id: disp.id, ativo: v })}
                        />
                        <Badge variant={disp.ativo ? "default" : "secondary"}>
                          {disp.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {disp.ultimo_acesso
                        ? new Date(disp.ultimo_acesso).toLocaleString("pt-BR")
                        : "Nunca"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => {
                          if (confirm("Remover este dispositivo?")) {
                            deleteDispositivo.mutate(disp.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {dispositivos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum dispositivo cadastrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ═══ API CONFIG ═══ */}
        <TabsContent value="api" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Configure a API REST pública de cada empresa para consulta de produtos.
          </p>
          {empresas.map((emp) => {
            const config = apiConfigs.find((c) => c.empresa_id === emp.id);
            return (
              <Card key={emp.id} className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">{emp.nome}</h3>
                  {config?.ativo && <Badge>Configurado</Badge>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">URL da API</label>
                    <Input
                      placeholder="https://api.empresa.com/v1"
                      defaultValue={config?.api_url ?? ""}
                      onBlur={(e) => setApiUrl(e.target.value)}
                      onChange={(e) => setApiUrl(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Token / API Key</label>
                    <Input
                      type="password"
                      placeholder="Bearer token ou API key"
                      defaultValue={config?.api_token ?? ""}
                      onBlur={(e) => setApiToken(e.target.value)}
                      onChange={(e) => setApiToken(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Tipo</label>
                    <select
                      className="w-full border rounded px-3 py-2 text-sm bg-background h-10"
                      defaultValue={config?.tipo_api ?? "rest"}
                      onChange={(e) => setApiTipo(e.target.value)}
                    >
                      <option value="rest">REST</option>
                      <option value="graphql">GraphQL</option>
                      <option value="vtex">VTEX</option>
                    </select>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    saveApiConfig.mutate({
                      empresa_id: emp.id,
                      api_url: apiUrl || config?.api_url || "",
                      api_token: apiToken || config?.api_token || "",
                      tipo_api: apiTipo || config?.tipo_api || "rest",
                    })
                  }
                >
                  <Settings className="h-4 w-4 mr-2" /> Salvar Configuração
                </Button>
              </Card>
            );
          })}
          {empresas.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">
              Cadastre uma empresa primeiro na aba "Empresas"
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
