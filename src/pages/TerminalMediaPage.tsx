import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Upload, Trash2, GripVertical, Image, Video, ExternalLink, Settings, Volume2, Bell, Paintbrush, LayoutGrid, RotateCcw, RefreshCw } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface TerminalMedia {
  id: string;
  nome: string;
  tipo: "imagem" | "video";
  url: string;
  storage_path: string;
  ordem: number;
  ativo: boolean;
  duracao_segundos: number;
  criado_em: string;
}

const SUGGESTION_TYPES = [
  { value: "complementares", label: "Complementares (IA)" },
  { value: "mesma_marca", label: "Mesma Marca" },
  { value: "perfil", label: "Por Perfil (IA)" },
  { value: "todas", label: "Todas (misto)" },
];

const LAYOUTS = [
  {
    value: "classico",
    label: "Clássico",
    desc: "Imagem grande no topo, nome, preço e sugestões abaixo",
    config: { font_nome: 24, font_preco: 72, img_size: 280, max_sugestoes: 3 },
  },
  {
    value: "compacto",
    label: "Compacto",
    desc: "Imagem menor, mais sugestões visíveis na tela",
    config: { font_nome: 20, font_preco: 56, img_size: 200, max_sugestoes: 6 },
  },
  {
    value: "vitrine",
    label: "Vitrine",
    desc: "Imagem enorme, preço destacado, sem sugestões",
    config: { font_nome: 28, font_preco: 96, img_size: 360, max_sugestoes: 0 },
  },
];

// ─── Sortable media item ───
function SortableMediaItem({
  item,
  onToggle,
  onDelete,
  onDurationChange,
}: {
  item: TerminalMedia;
  onToggle: (id: string, ativo: boolean) => void;
  onDelete: (item: TerminalMedia) => void;
  onDurationChange: (id: string, duracao: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.8 : !item.ativo ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`stat-card flex items-center gap-4 !p-3 ${isDragging ? "shadow-lg ring-2 ring-primary/30" : ""}`}
    >
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing shrink-0 touch-none">
        <GripVertical className="w-4 h-4 text-muted-foreground/40" />
      </button>

      <div className="w-20 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
        {item.tipo === "imagem" ? (
          <img src={item.url} alt={item.nome} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Video className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.nome}</p>
        <p className="text-xs text-muted-foreground capitalize">
          {item.tipo}
          {item.tipo === "imagem" && ` • ${item.duracao_segundos}s`}
        </p>
      </div>

      {item.tipo === "imagem" && (
        <div className="flex items-center gap-1 shrink-0">
          <Input
            type="number"
            min={3}
            max={60}
            value={item.duracao_segundos}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (val >= 3 && val <= 60) onDurationChange(item.id, val);
            }}
            className="w-16 h-8 text-xs text-center"
          />
          <span className="text-xs text-muted-foreground">seg</span>
        </div>
      )}

      <Switch checked={item.ativo} onCheckedChange={(checked) => onToggle(item.id, checked)} />

      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 text-destructive hover:text-destructive"
        onClick={() => onDelete(item)}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ─── Config helper ───
const saveConfig = async (chave: string, valor: string) => {
  const { error } = await supabase
    .from("terminal_config")
    .upsert({ chave, valor, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
  if (error) toast.error("Erro ao salvar");
  else toast.success("Configuração salva");
};

// ─── Main page ───
export default function TerminalMediaPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Configs
  const [tipoSugestao, setTipoSugestao] = useState("complementares");
  const [beepEnabled, setBeepEnabled] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [layout, setLayout] = useState("classico");
  const [fontNome, setFontNome] = useState(24);
  const [fontPreco, setFontPreco] = useState(72);
  const [imgSize, setImgSize] = useState(280);
  const [maxSugestoes, setMaxSugestoes] = useState(3);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Fetch all configs
  useEffect(() => {
    const fetchConfig = async () => {
      const { data } = await supabase
        .from("terminal_config")
        .select("chave, valor");
      if (data) {
        for (const row of data) {
          switch (row.chave) {
            case "tipo_sugestao": setTipoSugestao(row.valor); break;
            case "beep_enabled": setBeepEnabled(row.valor !== "false"); break;
            case "tts_enabled": setTtsEnabled(row.valor !== "false"); break;
            case "layout": setLayout(row.valor); break;
            case "font_nome": setFontNome(Number(row.valor) || 24); break;
            case "font_preco": setFontPreco(Number(row.valor) || 72); break;
            case "img_size": setImgSize(Number(row.valor) || 280); break;
            case "max_sugestoes": setMaxSugestoes(Number(row.valor) ?? 3); break;
          }
        }
      }
    };
    fetchConfig();
  }, []);

  // Media query
  const { data: mediaList = [], isLoading } = useQuery({
    queryKey: ["terminal-media"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("terminal_media")
        .select("*")
        .order("ordem", { ascending: true });
      if (error) throw error;
      return data as TerminalMedia[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (item: TerminalMedia) => {
      await supabase.storage.from("terminal-media").remove([item.storage_path]);
      const { error } = await supabase.from("terminal_media").delete().eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["terminal-media"] });
      toast.success("Mídia removida");
    },
    onError: () => toast.error("Erro ao remover mídia"),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("terminal_media").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["terminal-media"] }),
  });

  const updateDuration = useMutation({
    mutationFn: async ({ id, duracao_segundos }: { id: string; duracao_segundos: number }) => {
      const { error } = await supabase.from("terminal_media").update({ duracao_segundos }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["terminal-media"] }),
  });

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = mediaList.findIndex((m) => m.id === active.id);
    const newIndex = mediaList.findIndex((m) => m.id === over.id);
    const reordered = arrayMove(mediaList, oldIndex, newIndex);

    queryClient.setQueryData(["terminal-media"], reordered);

    const updates = reordered.map((item, i) =>
      supabase.from("terminal_media").update({ ordem: i }).eq("id", item.id)
    );
    await Promise.all(updates);
    queryClient.invalidateQueries({ queryKey: ["terminal-media"] });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    setUploading(true);
    const maxOrdem = mediaList.length > 0 ? Math.max(...mediaList.map(m => m.ordem)) + 1 : 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");
      if (!isVideo && !isImage) {
        toast.error(`Arquivo ${file.name} não é imagem nem vídeo`);
        continue;
      }

      const ext = file.name.split(".").pop();
      const path = `${Date.now()}-${i}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("terminal-media")
        .upload(path, file, { contentType: file.type });

      if (uploadError) {
        toast.error(`Erro ao enviar ${file.name}`);
        continue;
      }

      const { data: urlData } = supabase.storage.from("terminal-media").getPublicUrl(path);

      const { error: insertError } = await supabase.from("terminal_media").insert({
        nome: file.name,
        tipo: isVideo ? "video" : "imagem",
        url: urlData.publicUrl,
        storage_path: path,
        ordem: maxOrdem + i,
        duracao_segundos: isVideo ? 0 : 8,
      });

      if (insertError) toast.error(`Erro ao salvar ${file.name}`);
    }

    setUploading(false);
    queryClient.invalidateQueries({ queryKey: ["terminal-media"] });
    toast.success("Upload concluído");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const applyLayout = async (layoutKey: string) => {
    setLayout(layoutKey);
    const preset = LAYOUTS.find(l => l.value === layoutKey);
    if (!preset) return;
    const { font_nome, font_preco, img_size, max_sugestoes } = preset.config;
    setFontNome(font_nome);
    setFontPreco(font_preco);
    setImgSize(img_size);
    setMaxSugestoes(max_sugestoes);

    // Save all at once
    const configs = [
      { chave: "layout", valor: layoutKey },
      { chave: "font_nome", valor: String(font_nome) },
      { chave: "font_preco", valor: String(font_preco) },
      { chave: "img_size", valor: String(img_size) },
      { chave: "max_sugestoes", valor: String(max_sugestoes) },
    ];
    for (const c of configs) {
      await supabase.from("terminal_config").upsert(
        { ...c, atualizado_em: new Date().toISOString() },
        { onConflict: "chave" }
      );
    }
    toast.success(`Layout "${preset.label}" aplicado`);
  };

  const saveAppearanceValue = async (chave: string, valor: number, setter: (v: number) => void) => {
    setter(valor);
    setLayout("personalizado");
    await supabase.from("terminal_config").upsert(
      { chave, valor: String(valor), atualizado_em: new Date().toISOString() },
      { onConflict: "chave" }
    );
    await supabase.from("terminal_config").upsert(
      { chave: "layout", valor: "personalizado", atualizado_em: new Date().toISOString() },
      { onConflict: "chave" }
    );
  };

  const resetToDefault = async () => {
    await applyLayout("classico");
    toast.success("Aparência resetada para o padrão (Clássico)");
  };

  const resetConfigs = async () => {
    setTipoSugestao("complementares");
    setBeepEnabled(true);
    setTtsEnabled(true);
    const defaults = [
      { chave: "tipo_sugestao", valor: "complementares" },
      { chave: "beep_enabled", valor: "true" },
      { chave: "tts_enabled", valor: "true" },
    ];
    for (const c of defaults) {
      await supabase.from("terminal_config").upsert(
        { ...c, atualizado_em: new Date().toISOString() },
        { onConflict: "chave" }
      );
    }
    toast.success("Configurações resetadas para o padrão");
  };

  const notifyTerminal = async () => {
    await supabase.from("terminal_config").upsert(
      { chave: "last_updated", valor: new Date().toISOString(), atualizado_em: new Date().toISOString() },
      { onConflict: "chave" }
    );
    toast.success("Terminal notificado — ele irá recarregar as configurações");
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Terminal</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie mídias, aparência e configurações do terminal
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={notifyTerminal}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar Terminal
          </Button>
          <a href="/terminal" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink className="w-4 h-4 mr-2" />
              Ver Terminal
            </Button>
          </a>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={handleUpload}
      />

      <Tabs defaultValue="midia" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="midia" className="gap-2">
            <Image className="w-4 h-4" />
            Mídia
          </TabsTrigger>
          <TabsTrigger value="aparencia" className="gap-2">
            <Paintbrush className="w-4 h-4" />
            Aparência
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Settings className="w-4 h-4" />
            Configurações
          </TabsTrigger>
        </TabsList>

        {/* ═══ TAB: Mídia ═══ */}
        <TabsContent value="midia" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? "Enviando..." : "Upload"}
            </Button>
          </div>

          {isLoading ? (
            <div className="text-muted-foreground text-center py-12">Carregando...</div>
          ) : mediaList.length === 0 ? (
            <div className="stat-card flex flex-col items-center justify-center py-16 text-center">
              <Image className="w-16 h-16 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground text-lg">Nenhuma mídia cadastrada</p>
              <p className="text-muted-foreground/60 text-sm mt-1">
                Faça upload de imagens ou vídeos para exibir nos terminais
              </p>
              <Button className="mt-4" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                Fazer Upload
              </Button>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={mediaList.map(m => m.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {mediaList.map((item) => (
                    <SortableMediaItem
                      key={item.id}
                      item={item}
                      onToggle={(id, ativo) => toggleMutation.mutate({ id, ativo })}
                      onDelete={(item) => deleteMutation.mutate(item)}
                      onDurationChange={(id, dur) => updateDuration.mutate({ id, duracao_segundos: dur })}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </TabsContent>

        {/* ═══ TAB: Aparência ═══ */}
        <TabsContent value="aparencia" className="space-y-4">
          {/* Layout presets */}
          <div>
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <LayoutGrid className="w-4 h-4" />
              Layouts Pré-definidos
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {LAYOUTS.map(l => (
                <button
                  key={l.value}
                  onClick={() => applyLayout(l.value)}
                  className={`stat-card !p-4 text-left transition-all hover:ring-2 hover:ring-primary/30 ${
                    layout === l.value ? "ring-2 ring-primary" : ""
                  }`}
                >
                  <p className="text-sm font-semibold">{l.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{l.desc}</p>
                  <div className="mt-3 flex gap-2 text-[10px] text-muted-foreground/60">
                    <span>Nome: {l.config.font_nome}px</span>
                    <span>•</span>
                    <span>Preço: {l.config.font_preco}px</span>
                    <span>•</span>
                    <span>Sug: {l.config.max_sugestoes}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom controls */}
          <div className="space-y-5 stat-card !p-5">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-medium">Ajuste Fino</h3>
              {layout !== "personalizado" && (
                <span className="text-xs text-muted-foreground">Alterar desmarca o layout pré-definido</span>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Tamanho do Nome</label>
                <span className="text-xs font-mono text-muted-foreground">{fontNome}px</span>
              </div>
              <Slider
                min={14}
                max={40}
                step={1}
                value={[fontNome]}
                onValueCommit={(v) => saveAppearanceValue("font_nome", v[0], setFontNome)}
                onValueChange={(v) => setFontNome(v[0])}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Tamanho do Preço</label>
                <span className="text-xs font-mono text-muted-foreground">{fontPreco}px</span>
              </div>
              <Slider
                min={32}
                max={120}
                step={2}
                value={[fontPreco]}
                onValueCommit={(v) => saveAppearanceValue("font_preco", v[0], setFontPreco)}
                onValueChange={(v) => setFontPreco(v[0])}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Tamanho da Imagem</label>
                <span className="text-xs font-mono text-muted-foreground">{imgSize}px</span>
              </div>
              <Slider
                min={120}
                max={500}
                step={10}
                value={[imgSize]}
                onValueCommit={(v) => saveAppearanceValue("img_size", v[0], setImgSize)}
                onValueChange={(v) => setImgSize(v[0])}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Qtd. de Sugestões</label>
                <span className="text-xs font-mono text-muted-foreground">{maxSugestoes}</span>
              </div>
              <Slider
                min={0}
                max={8}
                step={1}
                value={[maxSugestoes]}
                onValueCommit={(v) => saveAppearanceValue("max_sugestoes", v[0], setMaxSugestoes)}
                onValueChange={(v) => setMaxSugestoes(v[0])}
              />
            </div>
          </div>

          {/* Live preview mockup */}
          <div className="stat-card !p-5">
            <p className="text-xs text-muted-foreground mb-3">Pré-visualização</p>
            <div className="bg-black/80 rounded-xl p-6 flex flex-col items-center gap-3 text-white">
              <div
                className="rounded-lg bg-white/10 flex items-center justify-center"
                style={{ width: Math.min(imgSize, 200), height: Math.min(imgSize, 200) }}
              >
                <Image className="w-8 h-8 text-white/30" />
              </div>
              <p style={{ fontSize: Math.min(fontNome, 20) }} className="font-semibold text-center">
                Nome do Produto
              </p>
              <p style={{ fontSize: Math.min(fontPreco, 48) }} className="font-bold text-emerald-400">
                R$ 12,<span className="text-[0.5em]">99</span>
              </p>
              {maxSugestoes > 0 && (
                <div className="flex gap-2 mt-2">
                  {Array.from({ length: Math.min(maxSugestoes, 4) }).map((_, i) => (
                    <div key={i} className="w-12 h-12 rounded bg-white/10" />
                  ))}
                  {maxSugestoes > 4 && (
                    <span className="text-xs text-white/40 self-center">+{maxSugestoes - 4}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ═══ TAB: Configurações ═══ */}
        <TabsContent value="config" className="space-y-4">
          <div className="stat-card !p-4 flex items-center gap-4">
            <Settings className="w-5 h-5 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Tipo de Sugestão</p>
              <p className="text-xs text-muted-foreground">Define quais sugestões aparecem ao consultar</p>
            </div>
            <Select value={tipoSugestao} onValueChange={(v) => { setTipoSugestao(v); saveConfig("tipo_sugestao", v); }}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUGGESTION_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="stat-card !p-4 flex items-center gap-4">
            <Bell className="w-5 h-5 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Bipe ao Consultar</p>
              <p className="text-xs text-muted-foreground">Toca um som ao bipar um código de barras</p>
            </div>
            <Switch checked={beepEnabled} onCheckedChange={(checked) => {
              setBeepEnabled(checked);
              saveConfig("beep_enabled", String(checked));
            }} />
          </div>

          <div className="stat-card !p-4 flex items-center gap-4">
            <Volume2 className="w-5 h-5 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Falar Preço (TTS)</p>
              <p className="text-xs text-muted-foreground">Lê o nome e preço do produto em voz alta</p>
            </div>
            <Switch checked={ttsEnabled} onCheckedChange={(checked) => {
              setTtsEnabled(checked);
              saveConfig("tts_enabled", String(checked));
            }} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
