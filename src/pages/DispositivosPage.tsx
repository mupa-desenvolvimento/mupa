import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Building2, Monitor, Plus, Trash2, Copy, QrCode, Globe, Settings, PanelRight, Barcode, Paintbrush,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import QRCode from "qrcode";

// ─── Types ───
interface Empresa {
  id: string;
  nome: string;
  slug: string;
  codigo_vinculo: string;
  logo_url: string | null;
  ativo: boolean;
  criado_em: string;
}

interface Dispositivo {
  id: string;
  empresa_id: string | null;
  grupo_id?: string | null;
  nome: string;
  codigo_ativacao: string;
  ativo: boolean;
  input_remoto_ativo?: boolean;
  config_override?: Record<string, unknown> | null;
  loja_numero?: string | null;
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

const TERMINAL_COMMANDS = [
  { label: "Apagar cache (preços + imagens)", value: "MUPA:CLEAR_CACHE" },
  { label: "Apagar cache de imagens sem fundo", value: "MUPA:CLEAR_NOBG" },
  { label: "Recarregar Terminal", value: "MUPA:RELOAD" },
  { label: "Voltar ao wizard", value: "MUPA:RESET_WIZARD" },
  { label: "Focar no input", value: "MUPA:FOCUS" },
] as const;

type DispositivoGrupo = {
  id: string;
  nome: string;
  parent_id: string | null;
  playlist_id: string | null;
};

type TerminalPlaylist = {
  id: string;
  nome: string;
  ativo: boolean;
};

type TerminalConsultEntry = {
  ean: string;
  ts: number;
  ok?: boolean;
};

function consultStorageKey(deviceId: string) {
  return `mupa_terminal_consult_history_${deviceId}`;
}

function loadConsultHistory(deviceId: string): TerminalConsultEntry[] {
  try {
    const raw = localStorage.getItem(consultStorageKey(deviceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is TerminalConsultEntry => {
        if (!x || typeof x !== "object") return false;
        const r = x as Record<string, unknown>;
        return typeof r.ean === "string" && typeof r.ts === "number";
      })
      .slice(0, 10);
  } catch {
    return [];
  }
}

function saveConsultHistory(deviceId: string, entries: TerminalConsultEntry[]) {
  try {
    localStorage.setItem(consultStorageKey(deviceId), JSON.stringify(entries.slice(0, 10)));
  } catch {
    return;
  }
}

function QrCodeTile({ label, value }: { label: string; value: string }) {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    let active = true;
    (QRCode as unknown as { toDataURL: (text: string, opts: unknown) => Promise<string> })
      .toDataURL(value, { margin: 1, width: 180 })
      .then((url) => {
        if (!active) return;
        setDataUrl(url);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [value]);

  return (
    <Card className="p-3 flex gap-3 items-center">
      <div className="h-[84px] w-[84px] rounded-md bg-white flex items-center justify-center border overflow-hidden shrink-0">
        {dataUrl ? <img src={dataUrl} alt={label} className="h-full w-full object-contain" /> : null}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-muted-foreground break-all">{value}</div>
      </div>
    </Card>
  );
}

type RealtimeChannel = ReturnType<typeof supabase.channel>;

function normalizeLojaNumero(value: string) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 12)
    .trim();
}

const TERMINAL_LAYOUTS = [
  { value: "classico", label: "Clássico", desc: "Imagem grande, nome e preço com boa hierarquia, sugestões abaixo" },
  { value: "compacto", label: "Compacto", desc: "Mais itens em tela, bom para telas menores" },
  { value: "painel", label: "Painel", desc: "Preço destacado e leitura rápida (varejo)" },
  { value: "cartaz", label: "Cartaz", desc: "Preço gigante e imagem grande, para leitura à distância" },
  { value: "vitrine", label: "Vitrine", desc: "Foco total no produto (sem sugestões)" },
  { value: "minimalista", label: "Minimalista", desc: "Visual limpo e sem sugestões" },
] as const;

const TERMINAL_LAYOUT_DEFAULTS: Record<(typeof TERMINAL_LAYOUTS)[number]["value"], { font_nome: number; font_preco: number; img_size: number; max_sugestoes: number }> = {
  classico: { font_nome: 24, font_preco: 72, img_size: 280, max_sugestoes: 3 },
  compacto: { font_nome: 20, font_preco: 56, img_size: 200, max_sugestoes: 6 },
  painel: { font_nome: 26, font_preco: 88, img_size: 300, max_sugestoes: 3 },
  cartaz: { font_nome: 30, font_preco: 110, img_size: 380, max_sugestoes: 2 },
  vitrine: { font_nome: 28, font_preco: 96, img_size: 360, max_sugestoes: 0 },
  minimalista: { font_nome: 26, font_preco: 84, img_size: 280, max_sugestoes: 0 },
};

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
  const [detailDevice, setDetailDevice] = useState<Dispositivo | null>(null);
  const [remoteEan, setRemoteEan] = useState("");
  const [sendingEan, setSendingEan] = useState(false);
  const [recentConsults, setRecentConsults] = useState<TerminalConsultEntry[]>([]);
  const [terminalLayout, setTerminalLayout] = useState<(typeof TERMINAL_LAYOUTS)[number]["value"]>("classico");
  const [savingLayout, setSavingLayout] = useState(false);
  const [terminalChannelReady, setTerminalChannelReady] = useState(false);
  const terminalChannelRef = useRef<RealtimeChannel | null>(null);
  const [commandQr, setCommandQr] = useState<{ label: string; value: string } | null>(null);
  const [commandQrDataUrl, setCommandQrDataUrl] = useState<string>("");
  const [deviceLojaNumero, setDeviceLojaNumero] = useState("");
  const [savingLojaNumero, setSavingLojaNumero] = useState(false);
  const [deviceAppearanceOpen, setDeviceAppearanceOpen] = useState(false);
  const [deviceOverrides, setDeviceOverrides] = useState<Record<string, unknown>>({});
  const [savingDeviceOverrides, setSavingDeviceOverrides] = useState(false);

  // API config state
  const [apiUrl, setApiUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [apiTipo, setApiTipo] = useState("rest");

  useEffect(() => {
    if (!commandQr) {
      setCommandQrDataUrl("");
      return;
    }
    let active = true;
    (QRCode as unknown as { toDataURL: (text: string, opts: unknown) => Promise<string> })
      .toDataURL(commandQr.value, { margin: 1, width: 360 })
      .then((url) => {
        if (!active) return;
        setCommandQrDataUrl(url);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [commandQr]);

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

  const { data: dispositivoGrupos = [] } = useQuery({
    queryKey: ["dispositivo_grupos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dispositivo_grupos").select("id, nome, parent_id, playlist_id").order("nome");
      if (error) throw error;
      return data as DispositivoGrupo[];
    },
  });

  const { data: terminalPlaylists = [] } = useQuery({
    queryKey: ["terminal_playlists"],
    queryFn: async () => {
      const { data, error } = await supabase.from("terminal_playlists").select("id, nome, ativo").order("nome");
      if (error) throw error;
      return data as TerminalPlaylist[];
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

  const toggleInputRemoto = useMutation({
    mutationFn: async ({ id, input_remoto_ativo }: { id: string; input_remoto_ativo: boolean }) => {
      const { error } = await supabase.from("dispositivos").update({ input_remoto_ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["dispositivos"] });
      setDetailDevice((d) => (d && d.id === v.id ? { ...d, input_remoto_ativo: v.input_remoto_ativo } : d));
      toast.success(v.input_remoto_ativo ? "Controlo remoto ativado" : "Controlo remoto desativado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateDispositivoGrupo = useMutation({
    mutationFn: async ({ id, grupo_id }: { id: string; grupo_id: string | null }) => {
      const { error } = await supabase.from("dispositivos").update({ grupo_id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["dispositivos"] });
      setDetailDevice((d) => (d && d.id === v.id ? { ...d, grupo_id: v.grupo_id } : d));
      toast.success("Grupo atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
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

  useEffect(() => {
    if (!detailDevice) return;
    void (async () => {
      const { data } = await supabase.from("terminal_config").select("valor").eq("chave", "layout").maybeSingle();
      const value = (data?.valor || "classico") as (typeof TERMINAL_LAYOUTS)[number]["value"];
      setTerminalLayout(TERMINAL_LAYOUT_DEFAULTS[value] ? value : "classico");
    })();
  }, [detailDevice]);

  useEffect(() => {
    if (!detailDevice) return;
    setDeviceLojaNumero(normalizeLojaNumero(detailDevice.loja_numero ?? ""));
    void (async () => {
      const { data } = await supabase.from("dispositivos").select("loja_numero").eq("id", detailDevice.id).maybeSingle();
      const loja = normalizeLojaNumero((data as { loja_numero?: string | null } | null)?.loja_numero ?? "");
      setDeviceLojaNumero(loja);
    })();
  }, [detailDevice]);

  useEffect(() => {
    if (!detailDevice) return;
    const existing = detailDevice.config_override;
    if (existing && typeof existing === "object") setDeviceOverrides(existing);
    else setDeviceOverrides({});

    void (async () => {
      const { data } = await supabase.from("dispositivos").select("config_override").eq("id", detailDevice.id).maybeSingle();
      const overrides = (data as { config_override?: unknown } | null)?.config_override;
      if (overrides && typeof overrides === "object") setDeviceOverrides(overrides as Record<string, unknown>);
      else setDeviceOverrides({});
    })();
  }, [detailDevice]);

  const saveDeviceOverrides = async (next: Record<string, unknown>) => {
    if (!detailDevice) return;
    setSavingDeviceOverrides(true);
    try {
      const { error } = await supabase
        .from("dispositivos")
        .update({ config_override: next } as Record<string, unknown>)
        .eq("id", detailDevice.id);
      if (error) throw error;
      setDeviceOverrides(next);
      setDetailDevice((prev) => (prev ? { ...prev, config_override: next } : prev));
      toast.success("Aparência do dispositivo atualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar aparência do dispositivo");
    } finally {
      setSavingDeviceOverrides(false);
    }
  };

  const saveDeviceLojaNumero = async () => {
    if (!detailDevice) return;
    const loja = normalizeLojaNumero(deviceLojaNumero);
    setSavingLojaNumero(true);
    try {
      const { error } = await supabase.from("dispositivos").update({ loja_numero: loja || null }).eq("id", detailDevice.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["dispositivos"] });
      setDetailDevice((d) => (d && d.id === detailDevice.id ? { ...d, loja_numero: loja || null } : d));
      toast.success("Número da loja atualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar número da loja");
    } finally {
      setSavingLojaNumero(false);
    }
  };

  const setOverrideValue = (key: string, value: unknown) => {
    setDeviceOverrides((prev) => ({ ...prev, [key]: value }));
  };

  const applyDeviceLayoutPreset = (layoutKey: (typeof TERMINAL_LAYOUTS)[number]["value"]) => {
    const preset = TERMINAL_LAYOUT_DEFAULTS[layoutKey];
    const next: Record<string, unknown> = {
      ...deviceOverrides,
      layout: layoutKey,
      font_nome: preset.font_nome,
      font_preco: preset.font_preco,
      img_size: preset.img_size,
      max_sugestoes: preset.max_sugestoes,
    };
    void saveDeviceOverrides(next);
  };

  useEffect(() => {
    if (!detailDevice) return;
    setRecentConsults(loadConsultHistory(detailDevice.id));

    const channel = supabase
      .channel(`terminal-ean-${detailDevice.id}`)
      .on("broadcast", { event: "consulted" }, ({ payload }) => {
        const p = payload as { ean?: string; ts?: number; ok?: boolean } | null;
        const digits = String(p?.ean ?? "").replace(/\D/g, "");
        const ts = typeof p?.ts === "number" ? p.ts : Date.now();
        if (!digits) return;
        const entry: TerminalConsultEntry = { ean: digits, ts, ok: p?.ok };

        setRecentConsults((prev) => {
          const next = [entry, ...prev.filter((x) => x.ean !== entry.ean)].slice(0, 10);
          saveConsultHistory(detailDevice.id, next);
          return next;
        });
      })
      .subscribe((status) => {
        setTerminalChannelReady(status === "SUBSCRIBED");
      });

    terminalChannelRef.current = channel;

    return () => {
      terminalChannelRef.current = null;
      setTerminalChannelReady(false);
      void supabase.removeChannel(channel);
    };
  }, [detailDevice]);

  const sendRemoteEan = async (raw: string) => {
    const text = raw.trim();
    if (!text) throw new Error("Informe um código");
    const upper = text.toUpperCase();
    const payloadEan = upper.startsWith("MUPA:") ? upper : text.replace(/\D/g, "");
    if (!payloadEan) throw new Error("Informe um EAN com números ou um comando MUPA:");
    const channel = terminalChannelRef.current;
    if (!channel || !terminalChannelReady) throw new Error("Canal Realtime não conectado ao terminal");
    const res = await channel.send({ type: "broadcast", event: "ean", payload: { ean: payloadEan } });
    if (res === "ok") return;
    throw new Error(res === "timed out" ? "Tempo esgotado ao enviar" : "Falha ao enviar EAN");
  };

  const applyTerminalLayout = async (layoutKey: (typeof TERMINAL_LAYOUTS)[number]["value"]) => {
    setSavingLayout(true);
    try {
      const preset = TERMINAL_LAYOUT_DEFAULTS[layoutKey];
      const now = new Date().toISOString();
      const configs = [
        { chave: "layout", valor: layoutKey },
        { chave: "font_nome", valor: String(preset.font_nome) },
        { chave: "font_preco", valor: String(preset.font_preco) },
        { chave: "img_size", valor: String(preset.img_size) },
        { chave: "max_sugestoes", valor: String(preset.max_sugestoes) },
      ];
      for (const c of configs) {
        const { error } = await supabase.from("terminal_config").upsert({ ...c, atualizado_em: now }, { onConflict: "chave" });
        if (error) throw error;
      }
      setTerminalLayout(layoutKey);
      toast.success(`Layout "${TERMINAL_LAYOUTS.find((l) => l.value === layoutKey)?.label ?? layoutKey}" aplicado`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar layout");
    } finally {
      setSavingLayout(false);
    }
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
                  <TableHead>Código Empresa</TableHead>
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
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
                            {emp.codigo_vinculo}
                          </code>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => copyToClipboard(emp.codigo_vinculo)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => {
                              const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(emp.codigo_vinculo)}`;
                              window.open(qrUrl, "_blank");
                            }}
                          >
                            <QrCode className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
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
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Controlo remoto / detalhes"
                          onClick={() => setDetailDevice(disp)}
                        >
                          <PanelRight className="h-4 w-4" />
                        </Button>
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
                      </div>
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

      <Sheet open={detailDevice !== null} onOpenChange={(o) => { if (!o) setDetailDevice(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {detailDevice && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Monitor className="h-5 w-5" />
                  {detailDevice.nome}
                </SheetTitle>
                <SheetDescription>
                  Controlo remoto do terminal: ative o envio de EAN a partir deste painel (requer Realtime no projeto Supabase).
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
                  <div><span className="text-muted-foreground">Empresa:</span>{" "}
                    <span className="font-medium">{getEmpresaNome(detailDevice.empresa_id)}</span></div>
                  <div className="font-mono text-xs">
                    <span className="text-muted-foreground">ID:</span> {detailDevice.id}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Código ativação:</span>{" "}
                    <code className="bg-muted px-1 rounded">{detailDevice.codigo_ativacao}</code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Loja:</span>{" "}
                    <span className="font-medium">{detailDevice.loja_numero ? detailDevice.loja_numero : "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Último acesso:</span>{" "}
                    {detailDevice.ultimo_acesso
                      ? new Date(detailDevice.ultimo_acesso).toLocaleString("pt-BR")
                      : "—"}
                  </div>
                </div>

                <div className="rounded-lg border p-4 space-y-2">
                  <div className="space-y-0.5">
                    <Label className="text-base">Número da loja</Label>
                    <p className="text-xs text-muted-foreground">
                      Este valor é usado na consulta de preço (número da loja na API). O terminal aplica automaticamente ao receber a atualização.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={deviceLojaNumero}
                      onChange={(e) => setDeviceLojaNumero(e.target.value)}
                      placeholder="Ex: LJ01"
                      className="font-mono"
                    />
                    <Button type="button" onClick={() => void saveDeviceLojaNumero()} disabled={savingLojaNumero}>
                      Salvar
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <Label className="text-base">Grupo de Conteúdo</Label>
                      <p className="text-xs text-muted-foreground">
                        Define qual playlist este terminal recebe (via grupo/subgrupo).
                      </p>
                    </div>
                    <Select
                      value={detailDevice.grupo_id ?? "none"}
                      onValueChange={(v) => updateDispositivoGrupo.mutate({ id: detailDevice.id, grupo_id: v === "none" ? null : v })}
                      disabled={updateDispositivoGrupo.isPending}
                    >
                      <SelectTrigger className="w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem grupo</SelectItem>
                        {dispositivoGrupos.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {detailDevice.grupo_id && (
                    <p className="text-xs text-muted-foreground">
                      Playlist do grupo:{" "}
                      {(() => {
                        const g = dispositivoGrupos.find((x) => x.id === detailDevice.grupo_id);
                        if (!g?.playlist_id) return "—";
                        return terminalPlaylists.find((p) => p.id === g.playlist_id)?.nome ?? "—";
                      })()}
                    </p>
                  )}
                </div>

                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <Label className="text-base">Comandos do Terminal (QR)</Label>
                      <p className="text-xs text-muted-foreground">
                        Escaneie estes QR Codes no Terminal para executar ações rápidas.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {TERMINAL_COMMANDS.map((cmd) => (
                      <div key={cmd.value} className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="flex-1 justify-between"
                          disabled={!detailDevice.input_remoto_ativo || sendingEan}
                          onClick={async () => {
                            setSendingEan(true);
                            try {
                              await sendRemoteEan(cmd.value);
                              toast.success("Comando enviado ao terminal");
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Erro ao enviar");
                            } finally {
                              setSendingEan(false);
                            }
                          }}
                        >
                          <span className="truncate">{cmd.label}</span>
                          <span className="ml-3 font-mono text-xs text-muted-foreground">{cmd.value}</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setCommandQr({ label: cmd.label, value: cmd.value })}
                        >
                          <QrCode className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {!detailDevice.input_remoto_ativo && (
                      <p className="text-xs text-amber-600 dark:text-amber-500">
                        Ative &quot;Input remoto&quot; para permitir o envio dos comandos.
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <Label className="text-base">Layout da consulta</Label>
                      <p className="text-xs text-muted-foreground">
                        Define como o produto aparece na tela do terminal.
                      </p>
                    </div>
                    <Button type="button" variant="secondary" onClick={() => setDeviceAppearanceOpen(true)}>
                      <PanelRight className="h-4 w-4 mr-2" />
                      Aparência
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <Select
                      value={terminalLayout}
                      onValueChange={(v) => void applyTerminalLayout(v as (typeof TERMINAL_LAYOUTS)[number]["value"])}
                      disabled={savingLayout}
                    >
                      <SelectTrigger className="w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TERMINAL_LAYOUTS.map((l) => (
                          <SelectItem key={l.value} value={l.value}>
                            {l.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {TERMINAL_LAYOUTS.find((l) => l.value === terminalLayout)?.desc}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="input-remoto" className="text-base">Input remoto (EAN)</Label>
                    <p className="text-xs text-muted-foreground">
                      Com ativado, o terminal aceita EAN enviado abaixo. Com desativado, mensagens são ignoradas.
                    </p>
                  </div>
                  <Switch
                    id="input-remoto"
                    checked={!!detailDevice.input_remoto_ativo}
                    disabled={toggleInputRemoto.isPending}
                    onCheckedChange={(v) =>
                      toggleInputRemoto.mutate({ id: detailDevice.id, input_remoto_ativo: v })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ean-remoto">Enviar EAN ao terminal</Label>
                  <div className="flex gap-2">
                    <Input
                      id="ean-remoto"
                      placeholder="7891234567890"
                      inputMode="numeric"
                      value={remoteEan}
                      onChange={(e) => setRemoteEan(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !!detailDevice.input_remoto_ativo) {
                          e.preventDefault();
                          void (async () => {
                            setSendingEan(true);
                            try {
                              await sendRemoteEan(remoteEan);
                              toast.success("EAN enviado ao terminal");
                              setRemoteEan("");
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Erro ao enviar");
                            } finally {
                              setSendingEan(false);
                            }
                          })();
                        }
                      }}
                      disabled={!detailDevice.input_remoto_ativo || sendingEan}
                    />
                    <Button
                      type="button"
                      disabled={!detailDevice.input_remoto_ativo || sendingEan || !remoteEan.trim()}
                      onClick={async () => {
                        setSendingEan(true);
                        try {
                          await sendRemoteEan(remoteEan);
                          toast.success("EAN enviado ao terminal");
                          setRemoteEan("");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Erro ao enviar");
                        } finally {
                          setSendingEan(false);
                        }
                      }}
                    >
                      <Barcode className="h-4 w-4 mr-2" />
                      Enviar
                    </Button>
                  </div>
                  {!detailDevice.input_remoto_ativo && (
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      Ative &quot;Input remoto&quot; acima para permitir o envio.
                    </p>
                  )}
                </div>

                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">Últimos EANs consultados</Label>
                      <p className="text-xs text-muted-foreground">Clique para reenviar ao terminal</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRecentConsults([]);
                        saveConsultHistory(detailDevice.id, []);
                        toast.success("Histórico limpo");
                      }}
                    >
                      Limpar
                    </Button>
                  </div>

                  {recentConsults.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhuma consulta recebida ainda.</p>
                  ) : (
                    <div className="grid gap-2">
                      {recentConsults.map((c) => (
                        <Button
                          key={`${c.ean}-${c.ts}`}
                          type="button"
                          variant="secondary"
                          className="justify-between font-mono"
                          disabled={!detailDevice.input_remoto_ativo || sendingEan}
                          onClick={async () => {
                            setSendingEan(true);
                            try {
                              await sendRemoteEan(c.ean);
                              toast.success("EAN enviado ao terminal");
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Erro ao enviar");
                            } finally {
                              setSendingEan(false);
                            }
                          }}
                        >
                          <span>{c.ean}</span>
                          <span className="text-xs font-sans text-muted-foreground">
                            {new Date(c.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <Sheet open={deviceAppearanceOpen} onOpenChange={setDeviceAppearanceOpen}>
                <SheetContent className="w-full sm:max-w-md overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                      <Paintbrush className="h-5 w-5" />
                      Aparência (por dispositivo)
                    </SheetTitle>
                    <SheetDescription>
                      Essas configurações sobrescrevem o padrão apenas para este terminal.
                    </SheetDescription>
                  </SheetHeader>

                  <div className="mt-6 space-y-6">
                    <div className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-base">Preset de Layout</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={savingDeviceOverrides}
                          onClick={() => void saveDeviceOverrides({})}
                        >
                          Resetar
                        </Button>
                      </div>
                      <Select
                        value={String(deviceOverrides.layout || "classico")}
                        onValueChange={(v) => applyDeviceLayoutPreset(v as (typeof TERMINAL_LAYOUTS)[number]["value"])}
                        disabled={savingDeviceOverrides}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TERMINAL_LAYOUTS.map((l) => (
                            <SelectItem key={l.value} value={l.value}>
                              {l.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {TERMINAL_LAYOUTS.find((l) => l.value === String(deviceOverrides.layout || "classico"))?.desc}
                      </p>
                    </div>

                    <div className="rounded-lg border p-4 space-y-3">
                      <Label className="text-base">Playlist (override)</Label>
                      <p className="text-xs text-muted-foreground">
                        Se definido, este terminal ignora o grupo e usa esta playlist.
                      </p>
                      <Select
                        value={typeof deviceOverrides.playlist_id === "string" && deviceOverrides.playlist_id ? deviceOverrides.playlist_id : "inherit"}
                        onValueChange={(v) => {
                          if (v === "inherit") {
                            const next: Record<string, unknown> = { ...deviceOverrides };
                            delete next.playlist_id;
                            void saveDeviceOverrides(next);
                            return;
                          }
                          void saveDeviceOverrides({ ...deviceOverrides, playlist_id: v });
                        }}
                        disabled={savingDeviceOverrides}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inherit">Herdar (grupo/padrão)</SelectItem>
                          {terminalPlaylists.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome}{p.ativo ? "" : " (inativa)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="rounded-lg border p-4 space-y-3">
                      <Label className="text-base">Tamanhos & Sugestões</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Fonte Nome</Label>
                          <Input
                            type="number"
                            value={String(deviceOverrides.font_nome ?? "")}
                            placeholder="24"
                            onChange={(e) => setOverrideValue("font_nome", Number(e.target.value))}
                            onBlur={() => void saveDeviceOverrides({ ...deviceOverrides })}
                            disabled={savingDeviceOverrides}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Fonte Preço</Label>
                          <Input
                            type="number"
                            value={String(deviceOverrides.font_preco ?? "")}
                            placeholder="72"
                            onChange={(e) => setOverrideValue("font_preco", Number(e.target.value))}
                            onBlur={() => void saveDeviceOverrides({ ...deviceOverrides })}
                            disabled={savingDeviceOverrides}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Tamanho Imagem</Label>
                          <Input
                            type="number"
                            value={String(deviceOverrides.img_size ?? "")}
                            placeholder="280"
                            onChange={(e) => setOverrideValue("img_size", Number(e.target.value))}
                            onBlur={() => void saveDeviceOverrides({ ...deviceOverrides })}
                            disabled={savingDeviceOverrides}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Max. Sugestões</Label>
                          <Input
                            type="number"
                            value={String(deviceOverrides.max_sugestoes ?? "")}
                            placeholder="3"
                            onChange={(e) => setOverrideValue("max_sugestoes", Number(e.target.value))}
                            onBlur={() => void saveDeviceOverrides({ ...deviceOverrides })}
                            disabled={savingDeviceOverrides}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border p-4 space-y-3">
                      <Label className="text-base">Posições & Margens</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Padding Externo</Label>
                          <Input
                            type="number"
                            value={String(deviceOverrides.layout_padding ?? "")}
                            placeholder="10"
                            onChange={(e) => setOverrideValue("layout_padding", Number(e.target.value))}
                            onBlur={() => void saveDeviceOverrides({ ...deviceOverrides })}
                            disabled={savingDeviceOverrides}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Gap</Label>
                          <Input
                            type="number"
                            value={String(deviceOverrides.layout_gap ?? "")}
                            placeholder="0 (auto)"
                            onChange={(e) => setOverrideValue("layout_gap", Number(e.target.value))}
                            onBlur={() => void saveDeviceOverrides({ ...deviceOverrides })}
                            disabled={savingDeviceOverrides}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Imagem (lado)</Label>
                          <Select
                            value={String(deviceOverrides.image_side || "right")}
                            onValueChange={(v) => { setOverrideValue("image_side", v); void saveDeviceOverrides({ ...deviceOverrides, image_side: v }); }}
                            disabled={savingDeviceOverrides}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="left">Esquerda</SelectItem>
                              <SelectItem value="right">Direita</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Alinhamento (h)</Label>
                          <Select
                            value={String(deviceOverrides.landscape_align || "top")}
                            onValueChange={(v) => { setOverrideValue("landscape_align", v); void saveDeviceOverrides({ ...deviceOverrides, landscape_align: v }); }}
                            disabled={savingDeviceOverrides}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="top">Topo</SelectItem>
                              <SelectItem value="center">Centro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Info (vertical)</Label>
                          <Select
                            value={String(deviceOverrides.info_vertical_align || "top")}
                            onValueChange={(v) => { setOverrideValue("info_vertical_align", v); void saveDeviceOverrides({ ...deviceOverrides, info_vertical_align: v }); }}
                            disabled={savingDeviceOverrides}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="top">Topo</SelectItem>
                              <SelectItem value="center">Centro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Margem da Imagem</Label>
                          <Input
                            type="number"
                            value={String(deviceOverrides.image_margin_right ?? "")}
                            placeholder="10"
                            onChange={(e) => setOverrideValue("image_margin_right", Number(e.target.value))}
                            onBlur={() => void saveDeviceOverrides({ ...deviceOverrides })}
                            disabled={savingDeviceOverrides}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border p-4 space-y-3">
                      <Label className="text-base">Overlay de Sugestões</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Inset</Label>
                          <Input
                            type="number"
                            value={String(deviceOverrides.suggestions_overlay_inset ?? "")}
                            placeholder="10"
                            onChange={(e) => setOverrideValue("suggestions_overlay_inset", Number(e.target.value))}
                            onBlur={() => void saveDeviceOverrides({ ...deviceOverrides })}
                            disabled={savingDeviceOverrides}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Altura (%)</Label>
                          <Input
                            type="number"
                            value={String(deviceOverrides.suggestions_overlay_max_pct ?? "")}
                            placeholder="40"
                            onChange={(e) => setOverrideValue("suggestions_overlay_max_pct", Number(e.target.value))}
                            onBlur={() => void saveDeviceOverrides({ ...deviceOverrides })}
                            disabled={savingDeviceOverrides}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border p-4 space-y-3">
                      <Label className="text-base">Texto do Loading</Label>
                      <Input
                        value={String(deviceOverrides.loading_text ?? "")}
                        placeholder="Por favor aguarde, consultando o produto"
                        onChange={(e) => setOverrideValue("loading_text", e.target.value)}
                        onBlur={() => void saveDeviceOverrides({ ...deviceOverrides })}
                        disabled={savingDeviceOverrides}
                      />
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={commandQr !== null} onOpenChange={(o) => { if (!o) setCommandQr(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              {commandQr?.label ?? "QR Code"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border bg-white p-3 flex items-center justify-center">
              {commandQrDataUrl ? (
                <img src={commandQrDataUrl} alt={commandQr?.label ?? "QR Code"} className="w-[320px] h-[320px] object-contain" />
              ) : null}
            </div>
            <div className="text-xs text-muted-foreground break-all">{commandQr?.value}</div>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (!commandQr?.value) return;
                  void (async () => {
                    try {
                      await navigator.clipboard.writeText(commandQr.value);
                      toast.success("Código copiado");
                    } catch {
                      toast.error("Não foi possível copiar");
                    }
                  })();
                }}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copiar
              </Button>
              <Button type="button" onClick={() => setCommandQr(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
