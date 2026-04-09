import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Upload, Trash2, GripVertical, Image, Video, ExternalLink, Settings, Volume2, Bell, Paintbrush, LayoutGrid, RotateCcw, RefreshCw, Palette, Waves, ListMusic, FolderTree, Play, Pause, Plus, X, Clock, Maximize2, Search, ArrowUpDown, SkipBack, SkipForward, ZoomIn, ZoomOut } from "lucide-react";
import {
  DndContext, closestCenter, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragMoveEvent, type DragStartEvent, type Modifier,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import QRCode from "qrcode";

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

interface DispositivoLite {
  id: string;
  nome: string;
  grupo_id: string | null;
}

type PlaylistItemRow = {
  id: string;
  playlist_id: string;
  ordem: number;
  duracao_segundos: number | null;
  media_id: string;
  terminal_media: TerminalMedia | null;
};

function formatDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

function clamp(min: number, value: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

const snapCenterToCursor: Modifier = ({ activatorEvent, activeNodeRect, transform }) => {
  if (!activatorEvent || !activeNodeRect) return transform;
  const e = activatorEvent as MouseEvent | TouchEvent;
  const point =
    "touches" in e
      ? (e.touches[0] ?? e.changedTouches[0])
      : (e as MouseEvent);
  if (!point) return transform;
  const x = point.clientX - activeNodeRect.left - activeNodeRect.width / 2;
  const y = point.clientY - activeNodeRect.top - activeNodeRect.height / 2;
  return { ...transform, x, y };
};

function MediaLibraryThumb({
  media,
  selected,
  onSelect,
  dnd,
}: {
  media: TerminalMedia;
  selected: boolean;
  onSelect: (id: string) => void;
  dnd?: {
    attributes: Record<string, unknown>;
    listeners: Record<string, unknown>;
    setNodeRef: (node: HTMLElement | null) => void;
    isDragging: boolean;
  };
}) {
  const kind = media.tipo;
  const duration = media.duracao_segundos ?? 0;
  const durationLabel = duration > 0 ? formatDuration(duration) : kind === "video" ? "Vídeo" : "—";

  return (
    <button
      type="button"
      onClick={() => onSelect(media.id)}
      className={[
        "group relative overflow-hidden rounded-xl border bg-muted/20 text-left",
        "transition-all hover:shadow-md hover:-translate-y-[1px]",
        dnd?.isDragging ? "opacity-60 scale-[0.98]" : "",
        selected ? "ring-2 ring-primary/35 border-primary/30 bg-primary/5" : "",
      ].join(" ")}
      style={{ aspectRatio: "1 / 1" }}
      ref={dnd?.setNodeRef}
      {...(dnd?.attributes ?? {})}
      {...(dnd?.listeners ?? {})}
    >
      {kind === "imagem" ? (
        <img src={media.url} alt={media.nome} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-slate-800/80 to-slate-950/90">
          <div className="absolute inset-0 flex items-center justify-center opacity-95">
            <div className="h-9 w-9 rounded-full bg-white/10 border border-white/15 backdrop-blur flex items-center justify-center">
              <Play className="h-4.5 w-4.5 text-white" />
            </div>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
      <div className="absolute left-2 bottom-2 flex items-center gap-1.5">
        <Badge className="bg-black/45 text-white border-white/10 backdrop-blur text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
          {kind === "video" ? <Video className="h-3 w-3" /> : <Image className="h-3 w-3" />}
          {kind.toUpperCase()}
        </Badge>
        <Badge className="bg-black/45 text-white border-white/10 backdrop-blur text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {durationLabel}
        </Badge>
      </div>
    </button>
  );
}

function DraggableLibraryThumb({
  media,
  selected,
  onSelect,
}: {
  media: TerminalMedia;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lib-${media.id}`,
    data: { type: "library", mediaId: media.id },
  });

  return (
    <MediaLibraryThumb
      media={media}
      selected={selected}
      onSelect={onSelect}
      dnd={{ attributes: attributes as unknown as Record<string, unknown>, listeners, setNodeRef, isDragging }}
    />
  );
}

function SortableTimelineItem({
  item,
  selected,
  onSelect,
  onRemove,
  widthPx,
}: {
  item: PlaylistItemRow;
  selected: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  widthPx: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined };
  const media = item.terminal_media;
  const kind = media?.tipo ?? "imagem";
  const duration = item.duracao_segundos ?? media?.duracao_segundos ?? 0;
  const durationLabel = duration > 0 ? formatDuration(duration) : kind === "video" ? "Vídeo" : "—";

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-70" : undefined}>
      <div
        className={[
          "group relative overflow-hidden rounded-xl border bg-muted/20",
          "transition-all",
          selected ? "ring-2 ring-primary/35 border-primary/30 bg-primary/5" : "hover:bg-muted/30",
          isOver && !isDragging ? "ring-2 ring-primary/25" : "",
        ].join(" ")}
        style={{ width: widthPx, height: 64 }}
      >
        <button type="button" className="absolute inset-0" onClick={() => onSelect(item.id)} aria-label="Selecionar item">
          {media?.tipo === "imagem" ? (
            <img src={media.url} alt={media.nome} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-slate-800/80 to-slate-950/90 flex items-center justify-center">
              <Play className="h-4 w-4 text-white" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
          <div className="absolute right-1.5 bottom-1.5 rounded-md bg-black/45 backdrop-blur px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {durationLabel}
          </div>
        </button>

        <button
          type="button"
          className="absolute left-1.5 top-1.5 h-7 w-7 rounded-full bg-black/45 backdrop-blur border border-white/15 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onRemove(item.id)}
          aria-label="Remover item"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          {...attributes}
          {...listeners}
          className="absolute right-1.5 top-1.5 h-7 w-7 rounded-full bg-black/45 backdrop-blur border border-white/15 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing touch-none"
          aria-label="Arrastar para reordenar"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

const SUGGESTION_TYPES = [
  { value: "complementares", label: "Complementares (IA)" },
  { value: "mesma_marca", label: "Mesma Marca" },
  { value: "perfil", label: "Por Perfil (IA)" },
  { value: "todas", label: "Todas (misto)" },
];

const LAYOUTS = [
  { value: "classico", label: "Clássico", desc: "Imagem grande no topo, nome, preço e sugestões abaixo", config: { font_nome: 24, font_preco: 72, img_size: 280, max_sugestoes: 3 } },
  { value: "compacto", label: "Compacto", desc: "Imagem menor, mais sugestões visíveis na tela", config: { font_nome: 20, font_preco: 56, img_size: 200, max_sugestoes: 6 } },
  { value: "painel", label: "Painel", desc: "Cartão amplo, preço bem destacado e leitura rápida (bom para varejo)", config: { font_nome: 26, font_preco: 88, img_size: 300, max_sugestoes: 3 } },
  { value: "cartaz", label: "Cartaz", desc: "Preço gigante e imagem grande, ideal para chamar atenção à distância", config: { font_nome: 30, font_preco: 110, img_size: 380, max_sugestoes: 2 } },
  { value: "vitrine", label: "Vitrine", desc: "Imagem enorme, preço destacado, sem sugestões", config: { font_nome: 28, font_preco: 96, img_size: 360, max_sugestoes: 0 } },
  { value: "minimalista", label: "Minimalista", desc: "Visual limpo e sem sugestões (menos poluição visual)", config: { font_nome: 26, font_preco: 84, img_size: 280, max_sugestoes: 0 } },
];

// ─── Sortable media item ───
function SortableMediaItem({ item, onToggle, onDelete, onDurationChange }: {
  item: TerminalMedia;
  onToggle: (id: string, ativo: boolean) => void;
  onDelete: (item: TerminalMedia) => void;
  onDurationChange: (id: string, duracao: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined, opacity: isDragging ? 0.8 : !item.ativo ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className={`stat-card flex items-center gap-4 !p-3 ${isDragging ? "shadow-lg ring-2 ring-primary/30" : ""}`}>
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing shrink-0 touch-none">
        <GripVertical className="w-4 h-4 text-muted-foreground/40" />
      </button>
      <div className="w-20 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
        {item.tipo === "imagem" ? (
          <img src={item.url} alt={item.nome} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Video className="w-6 h-6 text-muted-foreground" /></div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.nome}</p>
        <p className="text-xs text-muted-foreground capitalize">{item.tipo}{item.tipo === "imagem" && ` • ${item.duracao_segundos}s`}</p>
      </div>
      {item.tipo === "imagem" && (
        <div className="flex items-center gap-1 shrink-0">
          <Input type="number" min={3} max={60} value={item.duracao_segundos}
            onChange={(e) => { const val = parseInt(e.target.value); if (val >= 3 && val <= 60) onDurationChange(item.id, val); }}
            className="w-16 h-8 text-xs text-center" />
          <span className="text-xs text-muted-foreground">seg</span>
        </div>
      )}
      <Switch checked={item.ativo} onCheckedChange={(checked) => onToggle(item.id, checked)} />
      <Button variant="ghost" size="icon" className="shrink-0 text-destructive hover:text-destructive" onClick={() => onDelete(item)}>
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ─── Config helper ───
const saveConfig = async (chave: string, valor: string) => {
  const { error } = await supabase.from("terminal_config")
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
  // Color configs
  const [corAutoEnabled, setCorAutoEnabled] = useState(true);
  const [corFundo, setCorFundo] = useState("#f5f0ef");
  const [corDescricao, setCorDescricao] = useState("#c0392b");
  const [corPreco, setCorPreco] = useState("#1a1a1a");
  const [wavesEnabled, setWavesEnabled] = useState(false);
  const [footerEnabled, setFooterEnabled] = useState(true);
  const [footerClockEnabled, setFooterClockEnabled] = useState(true);
  const [mapeamentoApiUrl, setMapeamentoApiUrl] = useState("");
  const [layoutPadding, setLayoutPadding] = useState(10);
  const [layoutGap, setLayoutGap] = useState(0);
  const [imageMarginRight, setImageMarginRight] = useState(10);
  const [imageSide, setImageSide] = useState<"left" | "right">("right");
  const [landscapeAlign, setLandscapeAlign] = useState<"top" | "center">("top");
  const [suggestionsOverlayInset, setSuggestionsOverlayInset] = useState(10);
  const [suggestionsOverlayMaxPct, setSuggestionsOverlayMaxPct] = useState(40);
  const [loadingText, setLoadingText] = useState("Por favor aguarde, consultando o produto");
  const [infoVerticalAlign, setInfoVerticalAlign] = useState<"top" | "center">("top");
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [addPlaylistMediaId, setAddPlaylistMediaId] = useState<string | null>(null);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryFilter, setLibraryFilter] = useState<"all" | "imagem" | "video">("all");
  const [selectedLibraryMediaId, setSelectedLibraryMediaId] = useState<string | null>(null);
  const [selectedTimelineItemId, setSelectedTimelineItemId] = useState<string | null>(null);
  const [activeTimelineDragId, setActiveTimelineDragId] = useState<string | null>(null);
  const [timelineInsert, setTimelineInsert] = useState<{ px: number; index: number } | null>(null);
  const [previewExpandedOpen, setPreviewExpandedOpen] = useState(false);
  const [addToPlaylistOpen, setAddToPlaylistOpen] = useState(false);
  const [zoomPct, setZoomPct] = useState(100);
  const [playing, setPlaying] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupParentId, setNewGroupParentId] = useState<string | null>(null);
  const [newGroupPlaylistId, setNewGroupPlaylistId] = useState<string | null>(null);
  const [addDeviceToGroup, setAddDeviceToGroup] = useState<Record<string, string | undefined>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { setNodeRef: setTimelineDropRef, isOver: isTimelineDropOver } = useDroppable({ id: "timeline-drop" });
  const timelineInnerRef = useRef<HTMLDivElement | null>(null);
  const dragStartPointRef = useRef<{ x: number; y: number } | null>(null);

  // Fetch all configs
  useEffect(() => {
    const fetchConfig = async () => {
      const { data } = await supabase.from("terminal_config").select("chave, valor");
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
            case "max_sugestoes": {
              const n = Number(row.valor);
              setMaxSugestoes(Number.isFinite(n) ? n : 3);
              break;
            }
            case "cor_auto": setCorAutoEnabled(row.valor !== "false"); break;
            case "cor_fundo": setCorFundo(row.valor); break;
            case "cor_descricao": setCorDescricao(row.valor); break;
            case "cor_preco": setCorPreco(row.valor); break;
            case "waves_enabled": setWavesEnabled(row.valor === "true"); break;
            case "footer_enabled": setFooterEnabled(row.valor !== "false"); break;
            case "footer_clock_enabled": setFooterClockEnabled(row.valor !== "false"); break;
            case "layout_padding": {
              const n = Number(row.valor);
              if (Number.isFinite(n)) setLayoutPadding(n);
              break;
            }
            case "layout_gap": {
              const n = Number(row.valor);
              if (Number.isFinite(n)) setLayoutGap(n);
              break;
            }
            case "image_margin_right": {
              const n = Number(row.valor);
              if (Number.isFinite(n)) setImageMarginRight(n);
              break;
            }
            case "image_side": {
              const v = row.valor === "left" ? "left" : row.valor === "right" ? "right" : null;
              if (v) setImageSide(v);
              break;
            }
            case "landscape_align": {
              const v = row.valor === "top" ? "top" : row.valor === "center" ? "center" : null;
              if (v) setLandscapeAlign(v);
              break;
            }
            case "suggestions_overlay_inset": {
              const n = Number(row.valor);
              if (Number.isFinite(n)) setSuggestionsOverlayInset(n);
              break;
            }
            case "suggestions_overlay_max_pct": {
              const n = Number(row.valor);
              if (Number.isFinite(n)) setSuggestionsOverlayMaxPct(n);
              break;
            }
            case "loading_text": setLoadingText(row.valor); break;
            case "mapeamento_api_url": setMapeamentoApiUrl(row.valor); break;
            case "info_vertical_align": {
              const v = row.valor === "center" ? "center" : row.valor === "top" ? "top" : null;
              if (v) setInfoVerticalAlign(v);
              break;
            }
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
      const { data, error } = await supabase.from("terminal_media").select("*").order("ordem", { ascending: true });
      if (error) throw error;
      return data as TerminalMedia[];
    },
  });

  const { data: playlists = [] } = useQuery({
    queryKey: ["terminal-playlists"],
    queryFn: async () => {
      const { data, error } = await supabase.from("terminal_playlists").select("*").order("atualizado_em", { ascending: false });
      if (error) throw error;
      return data as { id: string; nome: string; ativo: boolean; criado_em: string; atualizado_em: string }[];
    },
  });

  const { data: grupos = [] } = useQuery({
    queryKey: ["dispositivo-grupos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dispositivo_grupos").select("*").order("nome", { ascending: true });
      if (error) throw error;
      return data as { id: string; nome: string; parent_id: string | null; playlist_id: string | null; criado_em: string; atualizado_em: string }[];
    },
  });

  const { data: dispositivos = [] } = useQuery({
    queryKey: ["dispositivos-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dispositivos").select("id, nome, grupo_id").order("nome", { ascending: true });
      if (error) throw error;
      return data as DispositivoLite[];
    },
  });

  const { data: playlistItems = [] } = useQuery({
    queryKey: ["terminal-playlist-items", selectedPlaylistId],
    enabled: !!selectedPlaylistId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("terminal_playlist_items")
        .select("id, playlist_id, ordem, duracao_segundos, media_id, terminal_media ( id, nome, tipo, url, duracao_segundos, criado_em )")
        .eq("playlist_id", selectedPlaylistId!)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return data as unknown as PlaylistItemRow[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (item: TerminalMedia) => {
      await supabase.storage.from("terminal-media").remove([item.storage_path]);
      const { error } = await supabase.from("terminal_media").delete().eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["terminal-media"] }); toast.success("Mídia removida"); },
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

  const createPlaylist = useMutation({
    mutationFn: async (nome: string) => {
      const { data, error } = await supabase.from("terminal_playlists").insert({ nome }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["terminal-playlists"] });
      setSelectedPlaylistId(id);
      setNewPlaylistName("");
      toast.success("Playlist criada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePlaylist = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("terminal_playlists").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["terminal-playlists"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deletePlaylist = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("terminal_playlists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["terminal-playlists"] });
      queryClient.invalidateQueries({ queryKey: ["terminal-playlist-items"] });
      if (selectedPlaylistId) setSelectedPlaylistId(null);
      toast.success("Playlist removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addPlaylistItem = useMutation({
    mutationFn: async ({ playlistId, mediaId }: { playlistId: string; mediaId: string }) => {
      const ordem = playlistItems.length > 0 ? Math.max(...playlistItems.map((i) => i.ordem)) + 1 : 0;
      const { error } = await supabase.from("terminal_playlist_items").insert({ playlist_id: playlistId, media_id: mediaId, ordem });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["terminal-playlist-items", selectedPlaylistId] });
      toast.success("Item adicionado");
      setAddPlaylistMediaId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addPlaylistItemAt = useMutation({
    mutationFn: async ({ playlistId, mediaId, index }: { playlistId: string; mediaId: string; index: number }) => {
      const ordem = playlistItems.length > 0 ? Math.max(...playlistItems.map((i) => i.ordem)) + 1 : 0;
      const { data, error } = await supabase
        .from("terminal_playlist_items")
        .insert({ playlist_id: playlistId, media_id: mediaId, ordem })
        .select("id, playlist_id, ordem, duracao_segundos, media_id, terminal_media ( id, nome, tipo, url, duracao_segundos, criado_em )")
        .single();
      if (error) throw error;
      return { item: data as unknown as PlaylistItemRow, index };
    },
    onSuccess: ({ item, index }) => {
      if (!selectedPlaylistId) return;
      const prev = (queryClient.getQueryData(["terminal-playlist-items", selectedPlaylistId]) as PlaylistItemRow[] | undefined) ?? [];
      const safeIndex = clamp(0, index, prev.length);
      const next = [...prev];
      next.splice(safeIndex, 0, item);
      const normalized = next.map((it, idx) => ({ ...it, ordem: idx }));
      queryClient.setQueryData(["terminal-playlist-items", selectedPlaylistId], normalized);
      savePlaylistOrder.mutate({ playlistId: selectedPlaylistId, orderedIds: normalized.map((x) => x.id) });
      setSelectedTimelineItemId(item.id);
      setSelectedLibraryMediaId(null);
      setZoomPct(100);
      setPlaying(false);
      toast.success("Item adicionado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePlaylistItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("terminal_playlist_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["terminal-playlist-items", selectedPlaylistId] });
      toast.success("Item removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const savePlaylistOrder = useMutation({
    mutationFn: async ({ playlistId, orderedIds }: { playlistId: string; orderedIds: string[] }) => {
      const updates = orderedIds.map((id, idx) =>
        supabase.from("terminal_playlist_items").update({ ordem: idx }).eq("id", id)
      );
      const results = await Promise.all(updates);
      const firstErr = results.find((r) => r.error)?.error;
      if (firstErr) throw firstErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["terminal-playlist-items", selectedPlaylistId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedPlaylist = useMemo(() => playlists.find((p) => p.id === selectedPlaylistId) ?? null, [playlists, selectedPlaylistId]);

  const playlistDurationSummary = useMemo(() => {
    let totalKnown = 0;
    let unknownCount = 0;
    for (const it of playlistItems) {
      const media = it.terminal_media;
      const kind = media?.tipo ?? "imagem";
      const duration = it.duracao_segundos ?? media?.duracao_segundos ?? 0;
      if (duration > 0) totalKnown += duration;
      else if (kind === "video") unknownCount += 1;
    }
    return { totalKnown, unknownCount };
  }, [playlistItems]);

  const filteredLibraryMedia = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    return mediaList.filter((m) => {
      if (libraryFilter !== "all" && m.tipo !== libraryFilter) return false;
      if (!q) return true;
      return m.nome.toLowerCase().includes(q);
    });
  }, [libraryFilter, libraryQuery, mediaList]);

  const selectedLibraryMedia = useMemo(() => {
    if (!selectedLibraryMediaId) return null;
    return mediaList.find((m) => m.id === selectedLibraryMediaId) ?? null;
  }, [mediaList, selectedLibraryMediaId]);

  const selectedTimelineItem = useMemo(() => {
    if (!selectedTimelineItemId) return null;
    return playlistItems.find((it) => it.id === selectedTimelineItemId) ?? null;
  }, [playlistItems, selectedTimelineItemId]);

  const previewMedia = useMemo(() => {
    if (selectedTimelineItem?.terminal_media) return selectedTimelineItem.terminal_media;
    if (selectedLibraryMedia) return selectedLibraryMedia;
    const first = playlistItems[0]?.terminal_media ?? null;
    return first;
  }, [playlistItems, selectedLibraryMedia, selectedTimelineItem]);

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const pendingSeekSecRef = useRef<number | null>(null);

  useEffect(() => {
    setPlaying(false);
    setPlayheadSec(0);
    pendingSeekSecRef.current = null;
    if (previewVideoRef.current) {
      previewVideoRef.current.pause();
      previewVideoRef.current.currentTime = 0;
    }
  }, [previewMedia?.url]);

  const timelineDurations = useMemo(() => {
    return playlistItems.map((it) => {
      const media = it.terminal_media;
      const kind = media?.tipo ?? "imagem";
      const base = kind === "imagem" ? 8 : 8;
      const dur = it.duracao_segundos ?? media?.duracao_segundos ?? base;
      const safe = Number.isFinite(dur) && dur > 0 ? dur : base;
      const width = Math.round(clamp(84, 56 + safe * 10, 260));
      return { id: it.id, durationSec: safe, widthPx: width };
    });
  }, [playlistItems]);

  const timelineLayout = useMemo(() => {
    const gap = 8;
    let totalSec = 0;
    let totalPx = 0;
    const segments: Array<{ id: string; startSec: number; endSec: number; startPx: number; endPx: number; durationSec: number; widthPx: number }> = [];
    for (let i = 0; i < playlistItems.length; i += 1) {
      const it = playlistItems[i];
      const meta = timelineDurations[i];
      const startSec = totalSec;
      const startPx = totalPx;
      totalSec += meta.durationSec;
      totalPx += meta.widthPx + (i === playlistItems.length - 1 ? 0 : gap);
      segments.push({
        id: it.id,
        startSec,
        endSec: totalSec,
        startPx,
        endPx: startPx + meta.widthPx,
        durationSec: meta.durationSec,
        widthPx: meta.widthPx,
      });
    }
    return { segments, totalSec, totalPx, gap };
  }, [playlistItems, timelineDurations]);

  const playheadPx = useMemo(() => {
    const t = clamp(0, playheadSec, timelineLayout.totalSec || 0);
    for (const seg of timelineLayout.segments) {
      if (t >= seg.startSec && t <= seg.endSec) {
        const local = seg.durationSec > 0 ? (t - seg.startSec) / seg.durationSec : 0;
        return seg.startPx + local * (seg.endPx - seg.startPx);
      }
    }
    return 0;
  }, [playheadSec, timelineLayout]);

  useEffect(() => {
    if (!selectedTimelineItemId) return;
    const seg = timelineLayout.segments.find((s) => s.id === selectedTimelineItemId);
    if (!seg) return;
    setPlayheadSec(seg.startSec);
  }, [selectedTimelineItemId, timelineLayout.segments]);

  useEffect(() => {
    if (!playing) return;
    if (previewMedia?.tipo !== "video") return;
    if (!selectedTimelineItemId) return;
    const seg = timelineLayout.segments.find((s) => s.id === selectedTimelineItemId);
    if (!seg) return;

    let raf = 0;
    const tick = () => {
      const el = previewVideoRef.current;
      if (el) {
        setPlayheadSec(seg.startSec + el.currentTime);
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [playing, previewMedia?.tipo, selectedTimelineItemId, timelineLayout.segments]);

  useEffect(() => {
    const sec = pendingSeekSecRef.current;
    if (sec == null) return;
    if (previewMedia?.tipo !== "video") {
      pendingSeekSecRef.current = null;
      return;
    }
    const el = previewVideoRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, sec);
    pendingSeekSecRef.current = null;
  }, [previewMedia?.tipo, previewMedia?.url]);

  const currentTimelineIndex = useMemo(() => {
    if (!selectedTimelineItemId) return -1;
    return playlistItems.findIndex((it) => it.id === selectedTimelineItemId);
  }, [playlistItems, selectedTimelineItemId]);

  const selectTimelineByIndex = useCallback((idx: number) => {
    if (playlistItems.length === 0) return;
    const i = ((idx % playlistItems.length) + playlistItems.length) % playlistItems.length;
    setSelectedTimelineItemId(playlistItems[i].id);
  }, [playlistItems]);

  const togglePlayPause = useCallback(() => {
    if (previewMedia?.tipo !== "video") return;
    const el = previewVideoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  }, [previewMedia?.tipo]);

  const seekToTime = useCallback((sec: number) => {
    const t = clamp(0, sec, timelineLayout.totalSec || 0);
    for (const seg of timelineLayout.segments) {
      if (t >= seg.startSec && t <= seg.endSec) {
        setSelectedTimelineItemId(seg.id);
        setSelectedLibraryMediaId(null);
        setPlayheadSec(t);
        const localSec = t - seg.startSec;
        const it = playlistItems.find((x) => x.id === seg.id);
        if (it?.terminal_media?.tipo === "video") {
          pendingSeekSecRef.current = localSec;
        } else {
          pendingSeekSecRef.current = null;
        }
        return;
      }
    }
    setPlayheadSec(t);
  }, [playlistItems, timelineLayout.segments, timelineLayout.totalSec]);

  const sortTimeline = useCallback((mode: "duration_desc" | "name_asc") => {
    if (!selectedPlaylistId) return;
    const next = [...playlistItems].sort((a, b) => {
      const ma = a.terminal_media;
      const mb = b.terminal_media;
      if (mode === "name_asc") {
        const na = (ma?.nome ?? "").toLowerCase();
        const nb = (mb?.nome ?? "").toLowerCase();
        return na.localeCompare(nb);
      }
      const da = a.duracao_segundos ?? ma?.duracao_segundos ?? (ma?.tipo === "imagem" ? 8 : 8);
      const db = b.duracao_segundos ?? mb?.duracao_segundos ?? (mb?.tipo === "imagem" ? 8 : 8);
      return db - da;
    }).map((it, idx) => ({ ...it, ordem: idx }));

    queryClient.setQueryData(["terminal-playlist-items", selectedPlaylistId], next);
    savePlaylistOrder.mutate({ playlistId: selectedPlaylistId, orderedIds: next.map((x) => x.id) });
    toast.success("Timeline ordenada");
  }, [playlistItems, queryClient, savePlaylistOrder, selectedPlaylistId]);

  const handleTimelineDragStart = useCallback((ev: DragStartEvent) => {
    setActiveTimelineDragId(String(ev.active.id));
    setTimelineInsert(null);
    const e = ev.activatorEvent as MouseEvent | TouchEvent | undefined;
    const point =
      e && "touches" in e
        ? (e.touches[0] ?? e.changedTouches[0])
        : (e as MouseEvent | undefined);
    dragStartPointRef.current = point ? { x: point.clientX, y: point.clientY } : null;
  }, []);

  const computeTimelineInsert = useCallback((pointerX: number, pointerY: number) => {
    if (!timelineInnerRef.current) return null;
    const rect = timelineInnerRef.current.getBoundingClientRect();
    if (pointerY < rect.top - 12 || pointerY > rect.bottom + 12) return null;
    const px = clamp(0, pointerX - rect.left, timelineLayout.totalPx || 0);
    if (timelineLayout.segments.length === 0) return { px: 0, index: 0 };

    for (let i = 0; i < timelineLayout.segments.length; i += 1) {
      const seg = timelineLayout.segments[i];
      const mid = seg.startPx + (seg.endPx - seg.startPx) / 2;
      if (px < mid) return { px: seg.startPx, index: i };
    }

    const last = timelineLayout.segments[timelineLayout.segments.length - 1];
    return { px: last.endPx + timelineLayout.gap, index: timelineLayout.segments.length };
  }, [timelineLayout.gap, timelineLayout.segments, timelineLayout.totalPx]);

  const handleTimelineDragMove = useCallback((ev: DragMoveEvent) => {
    if (!activeTimelineDragId) return;
    const start = dragStartPointRef.current;
    if (!start) return;
    const pointerX = start.x + ev.delta.x;
    const pointerY = start.y + ev.delta.y;
    const next = computeTimelineInsert(pointerX, pointerY);
    setTimelineInsert(next);
  }, [activeTimelineDragId, computeTimelineInsert]);

  const handleTimelineDragCancel = useCallback(() => {
    setActiveTimelineDragId(null);
    setTimelineInsert(null);
    dragStartPointRef.current = null;
  }, []);

  const handleTimelineDragEnd = useCallback((ev: DragEndEvent) => {
    setActiveTimelineDragId(null);
    dragStartPointRef.current = null;
    const overId = ev.over?.id;
    if (!selectedPlaylistId || !overId) return;
    const activeId = String(ev.active.id);
    const over = String(overId);
    if (activeId === over) return;

    if (activeId.startsWith("lib-")) {
      const mediaId = activeId.slice(4);
      const index = timelineInsert?.index ?? playlistItems.length;
      addPlaylistItemAt.mutate({ playlistId: selectedPlaylistId, mediaId, index });
      setTimelineInsert(null);
      return;
    }

    if (over === "timeline-drop") return;

    const oldIndex = playlistItems.findIndex((x) => x.id === activeId);
    const newIndex = playlistItems.findIndex((x) => x.id === over);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(playlistItems, oldIndex, newIndex).map((it, idx) => ({ ...it, ordem: idx }));
    queryClient.setQueryData(["terminal-playlist-items", selectedPlaylistId], next);
    savePlaylistOrder.mutate({ playlistId: selectedPlaylistId, orderedIds: next.map((x) => x.id) });
    setTimelineInsert(null);
  }, [addPlaylistItemAt, playlistItems, queryClient, savePlaylistOrder, selectedPlaylistId, timelineInsert?.index]);

  const createGrupo = useMutation({
    mutationFn: async ({ nome, parent_id, playlist_id }: { nome: string; parent_id: string | null; playlist_id: string | null }) => {
      const { error } = await supabase.from("dispositivo_grupos").insert({ nome, parent_id, playlist_id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dispositivo-grupos"] });
      setNewGroupName("");
      setNewGroupParentId(null);
      setNewGroupPlaylistId(null);
      toast.success("Grupo criado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateGrupo = useMutation({
    mutationFn: async ({ id, playlist_id, parent_id, nome }: { id: string; playlist_id: string | null; parent_id: string | null; nome: string }) => {
      const { error } = await supabase.from("dispositivo_grupos").update({ playlist_id, parent_id, nome }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dispositivo-grupos"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const updateDispositivoGrupo = useMutation({
    mutationFn: async ({ id, grupo_id }: { id: string; grupo_id: string | null }) => {
      const { error } = await supabase.from("dispositivos").update({ grupo_id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dispositivos-lite"] });
      queryClient.invalidateQueries({ queryKey: ["dispositivos"] });
      toast.success("Dispositivo atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = mediaList.findIndex((m) => m.id === active.id);
    const newIndex = mediaList.findIndex((m) => m.id === over.id);
    const reordered = arrayMove(mediaList, oldIndex, newIndex);
    queryClient.setQueryData(["terminal-media"], reordered);
    const updates = reordered.map((item, i) => supabase.from("terminal_media").update({ ordem: i }).eq("id", item.id));
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
      if (!isVideo && !isImage) { toast.error(`Arquivo ${file.name} não é imagem nem vídeo`); continue; }
      const ext = file.name.split(".").pop();
      const path = `${Date.now()}-${i}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("terminal-media").upload(path, file, { contentType: file.type });
      if (uploadError) { toast.error(`Erro ao enviar ${file.name}`); continue; }
      const { data: urlData } = supabase.storage.from("terminal-media").getPublicUrl(path);
      const { error: insertError } = await supabase.from("terminal_media").insert({
        nome: file.name, tipo: isVideo ? "video" : "imagem", url: urlData.publicUrl, storage_path: path, ordem: maxOrdem + i, duracao_segundos: isVideo ? 0 : 8,
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
    setFontNome(font_nome); setFontPreco(font_preco); setImgSize(img_size); setMaxSugestoes(max_sugestoes);
    const configs = [
      { chave: "layout", valor: layoutKey },
      { chave: "font_nome", valor: String(font_nome) },
      { chave: "font_preco", valor: String(font_preco) },
      { chave: "img_size", valor: String(img_size) },
      { chave: "max_sugestoes", valor: String(max_sugestoes) },
    ];
    for (const c of configs) {
      await supabase.from("terminal_config").upsert({ ...c, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
    }
    toast.success(`Layout "${preset.label}" aplicado`);
  };

  const playlistsById = new Map(playlists.map((p) => [p.id, p]));
  const gruposById = new Map(grupos.map((g) => [g.id, g]));

  const resolveGroupPlaylistId = (groupId: string): string | null => {
    let gid: string | null = groupId;
    for (let i = 0; i < 16 && gid; i += 1) {
      const g = gruposById.get(gid);
      if (!g) return null;
      if (g.playlist_id) return g.playlist_id;
      gid = g.parent_id;
    }
    return null;
  };

  const resolveGroupPlaylistLabel = (groupId: string): string => {
    const pid = resolveGroupPlaylistId(groupId);
    if (!pid) return "Mídia padrão";
    return playlistsById.get(pid)?.nome ?? "Playlist";
  };

  const saveAppearanceValue = async (chave: string, valor: number, setter: (v: number) => void) => {
    setter(valor);
    setLayout("personalizado");
    await supabase.from("terminal_config").upsert({ chave, valor: String(valor), atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
    await supabase.from("terminal_config").upsert({ chave: "layout", valor: "personalizado", atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
  };

  const saveAppearanceString = async (chave: string, valor: string, setter: (v: string) => void) => {
    setter(valor);
    setLayout("personalizado");
    await supabase.from("terminal_config").upsert({ chave, valor, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
    await supabase.from("terminal_config").upsert({ chave: "layout", valor: "personalizado", atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
  };

  const resetToDefault = async () => {
    await applyLayout("classico");
    // Reset colors too
    setCorAutoEnabled(true);
    setCorFundo("#f5f0ef");
    setCorDescricao("#c0392b");
    setCorPreco("#1a1a1a");
    setWavesEnabled(false);
    setFooterEnabled(true);
    setFooterClockEnabled(true);
    const colorDefaults = [
      { chave: "cor_auto", valor: "true" },
      { chave: "cor_fundo", valor: "#f5f0ef" },
      { chave: "cor_descricao", valor: "#c0392b" },
      { chave: "cor_preco", valor: "#1a1a1a" },
      { chave: "waves_enabled", valor: "false" },
      { chave: "footer_enabled", valor: "true" },
      { chave: "footer_clock_enabled", valor: "true" },
    ];
    for (const c of colorDefaults) {
      await supabase.from("terminal_config").upsert({ ...c, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
    }
    toast.success("Aparência resetada para o padrão (Clássico)");
  };

  const resetConfigs = async () => {
    setTipoSugestao("complementares"); setBeepEnabled(true); setTtsEnabled(true);
    const defaults = [
      { chave: "tipo_sugestao", valor: "complementares" },
      { chave: "beep_enabled", valor: "true" },
      { chave: "tts_enabled", valor: "true" },
    ];
    for (const c of defaults) {
      await supabase.from("terminal_config").upsert({ ...c, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
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

  const saveColorConfig = async (chave: string, valor: string) => {
    await supabase.from("terminal_config").upsert({ chave, valor, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
  };

  return (
    <div className="w-full h-[calc(100dvh-4rem)] flex flex-col overflow-hidden gap-4">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Terminal</h1>
          <p className="text-muted-foreground mt-1">Gerencie mídias, aparência e configurações do terminal</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={notifyTerminal}>
            <RefreshCw className="w-4 h-4 mr-2" />Atualizar Terminal
          </Button>
          <a href="/terminal" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm"><ExternalLink className="w-4 h-4 mr-2" />Ver Terminal</Button>
          </a>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleUpload} />

      <Tabs defaultValue="midia" className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <TabsList className="grid w-full grid-cols-5 shrink-0">
          <TabsTrigger value="midia" className="gap-2"><Image className="w-4 h-4" />Mídia</TabsTrigger>
          <TabsTrigger value="playlists" className="gap-2"><ListMusic className="w-4 h-4" />Playlists</TabsTrigger>
          <TabsTrigger value="grupos" className="gap-2"><FolderTree className="w-4 h-4" />Grupos</TabsTrigger>
          <TabsTrigger value="aparencia" className="gap-2"><Paintbrush className="w-4 h-4" />Aparência</TabsTrigger>
          <TabsTrigger value="config" className="gap-2"><Settings className="w-4 h-4" />Configurações</TabsTrigger>
        </TabsList>

        {/* ═══ TAB: Mídia ═══ */}
        <TabsContent value="midia" className="flex-1 min-h-0 overflow-auto space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <Upload className="w-4 h-4 mr-2" />{uploading ? "Enviando..." : "Upload"}
            </Button>
          </div>
          {isLoading ? (
            <div className="text-muted-foreground text-center py-12">Carregando...</div>
          ) : mediaList.length === 0 ? (
            <div className="stat-card flex flex-col items-center justify-center py-16 text-center">
              <Image className="w-16 h-16 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground text-lg">Nenhuma mídia cadastrada</p>
              <p className="text-muted-foreground/60 text-sm mt-1">Faça upload de imagens ou vídeos para exibir nos terminais</p>
              <Button className="mt-4" onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4 mr-2" />Fazer Upload</Button>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={mediaList.map(m => m.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {mediaList.map((item) => (
                    <SortableMediaItem key={item.id} item={item}
                      onToggle={(id, ativo) => toggleMutation.mutate({ id, ativo })}
                      onDelete={(item) => deleteMutation.mutate(item)}
                      onDurationChange={(id, dur) => updateDuration.mutate({ id, duracao_segundos: dur })} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </TabsContent>

        <TabsContent value="playlists" className="flex-1 min-h-0 overflow-hidden flex flex-col gap-3">
          <div className="stat-card !p-4 shrink-0">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select
                  value={selectedPlaylistId ?? "none"}
                  onValueChange={(v) => {
                    const next = v === "none" ? null : v;
                    setSelectedPlaylistId(next);
                    setSelectedTimelineItemId(null);
                    setSelectedLibraryMediaId(null);
                    setLibraryQuery("");
                    setZoomPct(100);
                    setPlaying(false);
                  }}
                >
                  <SelectTrigger className="w-[260px]">
                    <SelectValue placeholder="Selecione uma playlist" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione uma playlist</SelectItem>
                    {playlists.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedPlaylist ? (
                  <div className="flex items-center gap-2">
                    <Switch checked={selectedPlaylist.ativo} onCheckedChange={(v) => togglePlaylist.mutate({ id: selectedPlaylist.id, ativo: v })} />
                    <Button variant="ghost" size="icon" onClick={() => deletePlaylist.mutate(selectedPlaylist.id)} disabled={deletePlaylist.isPending}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)} placeholder="Nome da playlist" className="sm:w-[260px]" />
                <Button
                  onClick={() => {
                    const nome = newPlaylistName.trim();
                    if (!nome) return;
                    createPlaylist.mutate(nome);
                  }}
                  disabled={createPlaylist.isPending}
                >
                  <Plus className="w-4 h-4 mr-2" />Criar
                </Button>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  <Upload className="w-4 h-4 mr-2" />Upload
                </Button>
              </div>
            </div>
          </div>

          {!selectedPlaylistId ? (
            <div className="stat-card !p-10 text-center flex-1 min-h-0 flex flex-col items-center justify-center">
              <ListMusic className="w-12 h-12 text-muted-foreground/35 mx-auto" />
              <div className="mt-4 text-lg font-semibold">Editor de playlist</div>
              <div className="text-sm text-muted-foreground mt-1">Selecione uma playlist para editar: sidebar + preview + timeline</div>
            </div>
          ) : (
            <div className="stat-card !p-0 overflow-hidden flex-1 min-h-0">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleTimelineDragStart}
                onDragMove={handleTimelineDragMove}
                onDragEnd={handleTimelineDragEnd}
                onDragCancel={handleTimelineDragCancel}
              >
                <div className="grid h-full min-h-0 grid-cols-[260px_1fr]">
                  <aside className="border-r bg-muted/10 p-3 flex flex-col gap-3 min-h-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={libraryQuery}
                      onChange={(e) => setLibraryQuery(e.target.value)}
                      placeholder="Buscar mídia..."
                      className="pl-9"
                    />
                  </div>

                  <Select value={libraryFilter} onValueChange={(v) => setLibraryFilter(v as "all" | "imagem" | "video")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="imagem">Imagens</SelectItem>
                      <SelectItem value="video">Vídeos</SelectItem>
                    </SelectContent>
                  </Select>

                  <ScrollArea className="flex-1 min-h-0">
                    <div className="grid grid-cols-3 gap-1.5 pr-2">
                      {filteredLibraryMedia.map((m) => (
                        <DraggableLibraryThumb
                          key={m.id}
                          media={m}
                          selected={selectedLibraryMediaId === m.id}
                          onSelect={(id) => {
                            setSelectedLibraryMediaId(id);
                            setSelectedTimelineItemId(null);
                            setZoomPct(100);
                            setPlaying(false);
                          }}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                </aside>

                  <div className="flex flex-col min-h-0">
                    <div className="flex-1 min-h-0 p-4">
                      <div className="h-full min-h-0 flex flex-col gap-3">
                      <Card className="relative flex-1 bg-muted/10 overflow-hidden flex items-center justify-center">
                        {previewMedia ? (
                          previewMedia.tipo === "imagem" ? (
                            <img
                              src={previewMedia.url}
                              alt={previewMedia.nome}
                              className="max-h-full max-w-full object-contain transition-transform duration-150"
                              style={{ transform: `scale(${zoomPct / 100})` }}
                            />
                          ) : (
                            <video
                              ref={previewVideoRef}
                              src={previewMedia.url}
                              className="max-h-full max-w-full object-contain transition-transform duration-150"
                              style={{ transform: `scale(${zoomPct / 100})` }}
                              controls={false}
                              playsInline
                              onPause={() => setPlaying(false)}
                              onPlay={() => setPlaying(true)}
                            />
                          )
                        ) : (
                          <div className="text-sm text-muted-foreground">Selecione uma mídia</div>
                        )}

                        {previewMedia ? (
                          <div className="absolute left-4 bottom-4 rounded-full bg-background/80 backdrop-blur px-3 py-1 text-[11px] font-semibold border flex items-center gap-2">
                            {previewMedia.tipo === "video" ? <Video className="h-3.5 w-3.5" /> : <Image className="h-3.5 w-3.5" />}
                            {previewMedia.tipo.toUpperCase()}
                          </div>
                        ) : null}

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-3 top-3 bg-background/70 hover:bg-background/85 border"
                                onClick={() => setPreviewExpandedOpen(true)}
                                disabled={!previewMedia}
                              >
                                <Maximize2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Expandir</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Card>

                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{previewMedia?.nome ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {previewMedia?.criado_em ? new Date(previewMedia.criado_em).toLocaleString("pt-BR") : "—"}
                          </div>
                        </div>
                        {selectedLibraryMediaId ? (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              if (!selectedLibraryMediaId) return;
                              addPlaylistItem.mutate({ playlistId: selectedPlaylistId, mediaId: selectedLibraryMediaId });
                            }}
                            disabled={addPlaylistItem.isPending}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Adicionar
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="border-t px-4 py-3 bg-background/60 shrink-0">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex items-center gap-3">
                        <ZoomOut className="h-4 w-4 text-muted-foreground" />
                        <div className="w-[220px]">
                          <Slider
                            value={[zoomPct]}
                            min={50}
                            max={200}
                            step={5}
                            onValueChange={(v) => setZoomPct(v[0] ?? 100)}
                          />
                        </div>
                        <ZoomIn className="h-4 w-4 text-muted-foreground" />
                        <div className="text-xs font-semibold tabular-nums text-muted-foreground w-14 text-right">{zoomPct}%</div>
                      </div>

                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => selectTimelineByIndex(currentTimelineIndex - 1)}
                          disabled={playlistItems.length === 0}
                        >
                          <SkipBack className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 rounded-full"
                          onClick={togglePlayPause}
                          disabled={previewMedia?.tipo !== "video"}
                        >
                          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => selectTimelineByIndex(currentTimelineIndex + 1)}
                          disabled={playlistItems.length === 0}
                        >
                          <SkipForward className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="hidden lg:block text-xs text-muted-foreground text-right">
                        {savePlaylistOrder.isPending ? "Salvando ordem..." : "Arraste na timeline para reordenar"}
                      </div>
                    </div>
                  </div>

                  <div className="border-t px-4 py-3 bg-muted/10 space-y-2 shrink-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-muted-foreground">
                        Timeline • {formatDuration(playlistDurationSummary.totalKnown)} • {playlistItems.length} itens
                        {playlistDurationSummary.unknownCount > 0 ? ` (+${playlistDurationSummary.unknownCount} vídeo)` : ""}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <ArrowUpDown className="h-4 w-4 mr-2" />
                            Ordenar
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => sortTimeline("duration_desc")}>
                            Por duração (desc)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => sortTimeline("name_asc")}>
                            Por nome (A–Z)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <Card
                      ref={setTimelineDropRef}
                      className={[
                        "rounded-2xl bg-background/70 backdrop-blur p-2 transition-all shadow-sm",
                        isTimelineDropOver ? "ring-2 ring-primary/30 border-primary/30" : "",
                      ].join(" ")}
                    >
                      <SortableContext items={playlistItems.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
                        <ScrollArea className="w-full">
                          <div
                            ref={timelineInnerRef}
                            className="relative flex items-center gap-2 w-max pb-1 pr-2"
                            onClick={(e) => {
                              const rect = timelineInnerRef.current?.getBoundingClientRect();
                              if (!rect || timelineLayout.totalSec <= 0) return;
                              const x = e.clientX - rect.left;
                              const px = clamp(0, x, timelineLayout.totalPx || 0);
                              for (const seg of timelineLayout.segments) {
                                if (px >= seg.startPx && px <= seg.endPx) {
                                  const local = seg.endPx > seg.startPx ? (px - seg.startPx) / (seg.endPx - seg.startPx) : 0;
                                  seekToTime(seg.startSec + local * seg.durationSec);
                                  return;
                                }
                              }
                              seekToTime(timelineLayout.totalSec);
                            }}
                          >
                            <div
                              className="pointer-events-none absolute top-0 bottom-0 w-px bg-primary/60"
                              style={{ left: playheadPx }}
                            />
                            {activeTimelineDragId && timelineInsert ? (
                              <div
                                className="pointer-events-none absolute top-0 bottom-0 w-[2px] bg-primary"
                                style={{ left: timelineInsert.px }}
                              >
                                <div className="absolute -top-2 left-1/2 -translate-x-1/2 h-0 w-0 border-x-[6px] border-x-transparent border-b-[8px] border-b-primary" />
                              </div>
                            ) : null}

                            {playlistItems.map((it) => {
                              const meta = timelineLayout.segments.find((s) => s.id === it.id);
                              const widthPx = meta?.widthPx ?? 96;
                              return (
                                <SortableTimelineItem
                                  key={it.id}
                                  item={it}
                                  widthPx={widthPx}
                                  selected={selectedTimelineItemId === it.id}
                                  onSelect={(id) => { setSelectedTimelineItemId(id); setSelectedLibraryMediaId(null); setZoomPct(100); setPlaying(false); }}
                                  onRemove={(id) => {
                                    if (selectedTimelineItemId === id) setSelectedTimelineItemId(null);
                                    removePlaylistItem.mutate(id);
                                  }}
                                />
                              );
                            })}

                            <button
                              type="button"
                              className="h-16 w-24 rounded-xl border border-dashed bg-background hover:bg-muted/30 transition-colors flex items-center justify-center shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (selectedLibraryMediaId) {
                                  addPlaylistItemAt.mutate({ playlistId: selectedPlaylistId, mediaId: selectedLibraryMediaId, index: playlistItems.length });
                                  return;
                                }
                                setAddToPlaylistOpen(true);
                              }}
                              disabled={addPlaylistItemAt.isPending}
                              aria-label="Adicionar mídia à playlist"
                            >
                              <Plus className="h-5 w-5 text-muted-foreground" />
                            </button>
                          </div>
                        </ScrollArea>
                      </SortableContext>
                    </Card>
                  </div>
                </div>
              </div>
                <DragOverlay modifiers={[snapCenterToCursor]} adjustScale={false}>
                  {activeTimelineDragId ? (
                    <div className="pointer-events-none rounded-xl border bg-background shadow-2xl overflow-hidden" style={{ width: 140, height: 90 }}>
                      {(() => {
                        const id = activeTimelineDragId;
                        if (id.startsWith("lib-")) {
                          const mediaId = id.slice(4);
                          const m = mediaList.find((x) => x.id === mediaId) ?? null;
                          if (!m) return null;
                          return m.tipo === "imagem" ? (
                            <img src={m.url} alt={m.nome} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full bg-gradient-to-br from-slate-900/90 via-slate-800/80 to-slate-950/90 flex items-center justify-center">
                              <Play className="h-5 w-5 text-white" />
                            </div>
                          );
                        }
                        const it = playlistItems.find((x) => x.id === id) ?? null;
                        const m = it?.terminal_media ?? null;
                        if (!m) return null;
                        return m.tipo === "imagem" ? (
                          <img src={m.url} alt={m.nome} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full bg-gradient-to-br from-slate-900/90 via-slate-800/80 to-slate-950/90 flex items-center justify-center">
                            <Play className="h-5 w-5 text-white" />
                          </div>
                        );
                      })()}
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          )}

          <Dialog open={previewExpandedOpen} onOpenChange={setPreviewExpandedOpen}>
            <DialogContent className="max-w-5xl">
              <DialogHeader>
                <DialogTitle>Preview</DialogTitle>
              </DialogHeader>
              {previewMedia ? (
                <div className="rounded-2xl overflow-hidden border bg-black">
                  {previewMedia.tipo === "imagem" ? (
                    <img src={previewMedia.url} alt={previewMedia.nome} className="w-full max-h-[75vh] object-contain bg-black" />
                  ) : (
                    <video src={previewMedia.url} className="w-full max-h-[75vh] object-contain bg-black" controls playsInline />
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Nenhuma mídia selecionada.</div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={addToPlaylistOpen} onOpenChange={setAddToPlaylistOpen}>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Adicionar mídia à playlist</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={libraryQuery} onChange={(e) => setLibraryQuery(e.target.value)} placeholder="Buscar mídia..." className="pl-9" />
                </div>
                <Select value={libraryFilter} onValueChange={(v) => setLibraryFilter(v as "all" | "imagem" | "video")}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="imagem">Imagens</SelectItem>
                    <SelectItem value="video">Vídeos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="max-h-[60vh] overflow-y-auto pr-1">
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {filteredLibraryMedia.map((m) => (
                    <div key={m.id} className="space-y-2">
                      <MediaLibraryThumb
                        media={m}
                        selected={false}
                        onSelect={(id) => {
                          setAddPlaylistMediaId(id);
                          addPlaylistItem.mutate({ playlistId: selectedPlaylistId, mediaId: id });
                          setAddToPlaylistOpen(false);
                        }}
                      />
                      <div className="text-xs text-muted-foreground line-clamp-1">{m.nome}</div>
                    </div>
                  ))}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="grupos" className="flex-1 min-h-0 overflow-auto space-y-4">
          <div className="stat-card !p-5 space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2"><FolderTree className="w-4 h-4" />Grupos de Dispositivos</h3>
            <div className="grid gap-2 md:grid-cols-3">
              <Input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Nome do grupo" />
              <Select value={newGroupParentId ?? "none"} onValueChange={(v) => setNewGroupParentId(v === "none" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Pai (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem pai</SelectItem>
                  {grupos.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={newGroupPlaylistId ?? "none"} onValueChange={(v) => setNewGroupPlaylistId(v === "none" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Playlist (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{newGroupParentId ? "Herdar do pai" : "Sem playlist"}</SelectItem>
                  {playlists.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  const nome = newGroupName.trim();
                  if (!nome) return;
                  createGrupo.mutate({ nome, parent_id: newGroupParentId, playlist_id: newGroupPlaylistId });
                }}
                disabled={createGrupo.isPending}
              >
                Criar Grupo
              </Button>
            </div>
          </div>

          <div className="stat-card !p-4 space-y-2">
            {grupos.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Nenhum grupo criado</div>
            ) : (
              grupos.map((g) => (
                <div key={g.id} className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Input
                      defaultValue={g.nome}
                      onBlur={(e) => {
                        const nome = e.target.value.trim();
                        if (!nome || nome === g.nome) return;
                        updateGrupo.mutate({ id: g.id, nome, parent_id: g.parent_id, playlist_id: g.playlist_id });
                      }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Playlist efetiva: {resolveGroupPlaylistLabel(g.id)}
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <Select
                      value={g.parent_id ?? "none"}
                      onValueChange={(v) => updateGrupo.mutate({ id: g.id, nome: g.nome, parent_id: v === "none" ? null : v, playlist_id: g.playlist_id })}
                    >
                      <SelectTrigger><SelectValue placeholder="Pai" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem pai</SelectItem>
                        {grupos.filter((x) => x.id !== g.id).map((x) => (
                          <SelectItem key={x.id} value={x.id}>
                            {x.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={g.playlist_id ?? "none"}
                      onValueChange={(v) => updateGrupo.mutate({ id: g.id, nome: g.nome, parent_id: g.parent_id, playlist_id: v === "none" ? null : v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Playlist" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{g.parent_id ? "Herdar do pai" : "Sem playlist"}</SelectItem>
                        {playlists.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="text-xs font-medium">Dispositivos</div>
                    <div className="space-y-2">
                      {dispositivos.filter((d) => d.grupo_id === g.id).length === 0 ? (
                        <div className="text-xs text-muted-foreground">Nenhum dispositivo vinculado</div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {dispositivos.filter((d) => d.grupo_id === g.id).map((d) => (
                            <div key={d.id} className="flex items-center gap-2 rounded-full border bg-background px-3 py-1">
                              <div className="text-xs">{d.nome}</div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => updateDispositivoGrupo.mutate({ id: d.id, grupo_id: null })}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <Select
                      value={addDeviceToGroup[g.id]}
                      onValueChange={(deviceId) => {
                        setAddDeviceToGroup((prev) => ({ ...prev, [g.id]: deviceId }));
                        updateDispositivoGrupo.mutate(
                          { id: deviceId, grupo_id: g.id },
                          { onSuccess: () => setAddDeviceToGroup((prev) => ({ ...prev, [g.id]: undefined })) }
                        );
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Vincular dispositivo…" /></SelectTrigger>
                      <SelectContent>
                        {dispositivos.filter((d) => d.grupo_id !== g.id).map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        {/* ═══ TAB: Aparência ═══ */}
        <TabsContent value="aparencia" className="flex-1 min-h-0 overflow-auto space-y-4">
          {/* Layout presets */}
          <div>
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2"><LayoutGrid className="w-4 h-4" />Layouts Pré-definidos</h3>
            <div className="grid grid-cols-3 gap-3">
              {LAYOUTS.map(l => (
                <button key={l.value} onClick={() => applyLayout(l.value)}
                  className={`stat-card !p-4 text-left transition-all hover:ring-2 hover:ring-primary/30 ${layout === l.value ? "ring-2 ring-primary" : ""}`}>
                  <p className="text-sm font-semibold">{l.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{l.desc}</p>
                  <div className="mt-3 flex gap-2 text-[10px] text-muted-foreground/60">
                    <span>Nome: {l.config.font_nome}px</span><span>•</span>
                    <span>Preço: {l.config.font_preco}px</span><span>•</span>
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
              <Button variant="ghost" size="sm" onClick={resetToDefault} className="text-xs gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" />Resetar para Padrão
              </Button>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Tamanho do Nome</label>
                <span className="text-xs font-mono text-muted-foreground">{fontNome}px</span>
              </div>
              <Slider min={14} max={40} step={1} value={[fontNome]}
                onValueCommit={(v) => saveAppearanceValue("font_nome", v[0], setFontNome)}
                onValueChange={(v) => setFontNome(v[0])} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Tamanho do Preço</label>
                <span className="text-xs font-mono text-muted-foreground">{fontPreco}px</span>
              </div>
              <Slider min={32} max={120} step={2} value={[fontPreco]}
                onValueCommit={(v) => saveAppearanceValue("font_preco", v[0], setFontPreco)}
                onValueChange={(v) => setFontPreco(v[0])} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Tamanho da Imagem</label>
                <span className="text-xs font-mono text-muted-foreground">{imgSize}px</span>
              </div>
              <Slider min={120} max={500} step={10} value={[imgSize]}
                onValueCommit={(v) => saveAppearanceValue("img_size", v[0], setImgSize)}
                onValueChange={(v) => setImgSize(v[0])} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Qtd. de Sugestões</label>
                <span className="text-xs font-mono text-muted-foreground">{maxSugestoes}</span>
              </div>
              <Slider min={0} max={8} step={1} value={[maxSugestoes]}
                onValueCommit={(v) => saveAppearanceValue("max_sugestoes", v[0], setMaxSugestoes)}
                onValueChange={(v) => setMaxSugestoes(v[0])} />
            </div>
          </div>

          <div className="space-y-5 stat-card !p-5">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-medium">Layout & Margens</h3>
              <Button variant="ghost" size="sm" onClick={notifyTerminal} className="text-xs gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />Aplicar no Terminal
              </Button>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Padding Externo</label>
                <span className="text-xs font-mono text-muted-foreground">{layoutPadding}px</span>
              </div>
              <Slider min={0} max={30} step={1} value={[layoutPadding]}
                onValueCommit={(v) => saveAppearanceValue("layout_padding", v[0], setLayoutPadding)}
                onValueChange={(v) => setLayoutPadding(v[0])} />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Espaçamento (gap)</label>
                <span className="text-xs font-mono text-muted-foreground">{layoutGap === 0 ? "Auto" : `${layoutGap}px`}</span>
              </div>
              <Slider min={0} max={50} step={1} value={[layoutGap]}
                onValueCommit={(v) => saveAppearanceValue("layout_gap", v[0], setLayoutGap)}
                onValueChange={(v) => setLayoutGap(v[0])} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Imagem (lado)</label>
                <Select value={imageSide} onValueChange={(v) => { setImageSide(v as "left" | "right"); saveConfig("image_side", v); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Esquerda</SelectItem>
                    <SelectItem value="right">Direita</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Alinhamento (horizontal)</label>
                <Select value={landscapeAlign} onValueChange={(v) => { setLandscapeAlign(v as "top" | "center"); saveConfig("landscape_align", v); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top">Topo</SelectItem>
                    <SelectItem value="center">Centro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Informações (alinhamento vertical)</label>
              <Select value={infoVerticalAlign} onValueChange={(v) => { void saveAppearanceString("info_vertical_align", v, (nv) => setInfoVerticalAlign(nv as "top" | "center")); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="top">Topo</SelectItem>
                  <SelectItem value="center">Centro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Margem Direita da Imagem</label>
                <span className="text-xs font-mono text-muted-foreground">{imageMarginRight}px</span>
              </div>
              <Slider min={0} max={30} step={1} value={[imageMarginRight]}
                onValueCommit={(v) => saveAppearanceValue("image_margin_right", v[0], setImageMarginRight)}
                onValueChange={(v) => setImageMarginRight(v[0])} />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Inset do Overlay de Sugestões</label>
                <span className="text-xs font-mono text-muted-foreground">{suggestionsOverlayInset}px</span>
              </div>
              <Slider min={0} max={20} step={1} value={[suggestionsOverlayInset]}
                onValueCommit={(v) => saveAppearanceValue("suggestions_overlay_inset", v[0], setSuggestionsOverlayInset)}
                onValueChange={(v) => setSuggestionsOverlayInset(v[0])} />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Altura do Overlay de Sugestões</label>
                <span className="text-xs font-mono text-muted-foreground">{suggestionsOverlayMaxPct}%</span>
              </div>
              <Slider min={20} max={50} step={1} value={[suggestionsOverlayMaxPct]}
                onValueCommit={(v) => saveAppearanceValue("suggestions_overlay_max_pct", v[0], setSuggestionsOverlayMaxPct)}
                onValueChange={(v) => setSuggestionsOverlayMaxPct(v[0])} />
            </div>
          </div>

          {/* ─── Cores ─── */}
          <div className="space-y-4 stat-card !p-5">
            <h3 className="text-sm font-medium flex items-center gap-2"><Palette className="w-4 h-4" />Cores</h3>

            {/* Auto color toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Cores Automáticas</p>
                <p className="text-xs text-muted-foreground">Extrai as cores dominantes da imagem do produto</p>
              </div>
              <Switch checked={corAutoEnabled} onCheckedChange={(checked) => {
                setCorAutoEnabled(checked);
                saveColorConfig("cor_auto", String(checked));
              }} />
            </div>

            {/* Manual color pickers — shown when auto is off */}
            {!corAutoEnabled && (
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-muted-foreground">Fundo da Tela</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={corFundo} onChange={(e) => { setCorFundo(e.target.value); saveColorConfig("cor_fundo", e.target.value); }}
                      className="w-8 h-8 rounded-md border border-border cursor-pointer" />
                    <span className="text-xs font-mono text-muted-foreground w-16">{corFundo}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm text-muted-foreground">Container Descrição</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={corDescricao} onChange={(e) => { setCorDescricao(e.target.value); saveColorConfig("cor_descricao", e.target.value); }}
                      className="w-8 h-8 rounded-md border border-border cursor-pointer" />
                    <span className="text-xs font-mono text-muted-foreground w-16">{corDescricao}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm text-muted-foreground">Cor do Preço</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={corPreco} onChange={(e) => { setCorPreco(e.target.value); saveColorConfig("cor_preco", e.target.value); }}
                      className="w-8 h-8 rounded-md border border-border cursor-pointer" />
                    <span className="text-xs font-mono text-muted-foreground w-16">{corPreco}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Waves toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <Waves className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Ondas de Fundo (SVG)</p>
                  <p className="text-xs text-muted-foreground">Exibe ondas decorativas atrás do produto</p>
                </div>
              </div>
              <Switch checked={wavesEnabled} onCheckedChange={(checked) => {
                setWavesEnabled(checked);
                saveColorConfig("waves_enabled", String(checked));
              }} />
            </div>
          </div>

          {/* Live preview */}
          <div className="stat-card !p-5">
            <p className="text-xs text-muted-foreground mb-3">Pré-visualização</p>
            <div className="rounded-xl p-6 flex flex-col items-center gap-3 relative overflow-hidden"
              style={{ background: corAutoEnabled ? "linear-gradient(160deg, #f5f0ef, #f8f2f1, #faf6f5)" : `linear-gradient(160deg, ${corFundo}, ${corFundo}ee)` }}>
              {wavesEnabled && (
                <svg className="absolute bottom-0 left-0 w-full pointer-events-none" viewBox="0 0 1440 200" preserveAspectRatio="none" style={{ height: "40%", opacity: 0.5 }}>
                  <path fill={corAutoEnabled ? "rgba(192,57,43,0.1)" : `${corDescricao}18`}
                    d="M0,128L48,117.3C96,107,192,85,288,90.7C384,96,480,128,576,138.7C672,149,768,139,864,122.7C960,107,1056,85,1152,85.3C1248,85,1344,107,1392,117.3L1440,128L1440,200L0,200Z" />
                  <path fill={corAutoEnabled ? "rgba(192,57,43,0.06)" : `${corDescricao}10`} style={{ opacity: 0.6 }}
                    d="M0,160L48,154.7C96,149,192,139,288,138.7C384,139,480,149,576,154.7C672,160,768,160,864,149.3C960,139,1056,117,1152,112C1248,107,1344,117,1392,122.7L1440,128L1440,200L0,200Z" />
                </svg>
              )}
              <div className="rounded-lg flex items-center justify-center z-10"
                style={{ width: Math.min(imgSize, 200), height: Math.min(imgSize, 200), background: "rgba(0,0,0,0.04)" }}>
                <Image className="w-8 h-8 text-black/20" />
              </div>
              <div className="w-full rounded-lg px-3 py-2 text-center z-10 text-white"
                style={{ background: corAutoEnabled ? "linear-gradient(135deg, #c0392b, #a93226)" : `linear-gradient(135deg, ${corDescricao}, ${corDescricao}cc)` }}>
                <p style={{ fontSize: Math.min(fontNome, 20) }} className="font-semibold">Nome do Produto</p>
              </div>
              <p style={{ fontSize: Math.min(fontPreco, 48), color: corAutoEnabled ? "#1a1a1a" : corPreco }} className="font-bold z-10">
                R$ 12,<span className="text-[0.5em]">99</span>
              </p>
              {maxSugestoes > 0 && (
                <div className="flex gap-2 mt-2 z-10">
                  {Array.from({ length: Math.min(maxSugestoes, 4) }).map((_, i) => (
                    <div key={i} className="w-12 h-12 rounded" style={{ background: "rgba(0,0,0,0.04)" }} />
                  ))}
                  {maxSugestoes > 4 && <span className="text-xs text-black/30 self-center">+{maxSugestoes - 4}</span>}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ═══ TAB: Configurações ═══ */}
        <TabsContent value="config" className="flex-1 min-h-0 overflow-auto space-y-4">
          <div className="stat-card !p-4 flex items-center gap-4">
            <Settings className="w-5 h-5 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Tipo de Sugestão</p>
              <p className="text-xs text-muted-foreground">Define quais sugestões aparecem ao consultar</p>
            </div>
            <Select value={tipoSugestao} onValueChange={(v) => { setTipoSugestao(v); saveConfig("tipo_sugestao", v); }}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUGGESTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="stat-card !p-4 flex items-center gap-4">
            <Bell className="w-5 h-5 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Bipe ao Consultar</p>
              <p className="text-xs text-muted-foreground">Toca um som ao bipar um código de barras</p>
            </div>
            <Switch checked={beepEnabled} onCheckedChange={(checked) => { setBeepEnabled(checked); saveConfig("beep_enabled", String(checked)); }} />
          </div>

          <div className="stat-card !p-4 flex items-center gap-4">
            <Volume2 className="w-5 h-5 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Falar Preço (TTS)</p>
              <p className="text-xs text-muted-foreground">Lê o nome e preço do produto em voz alta</p>
            </div>
            <Switch checked={ttsEnabled} onCheckedChange={(checked) => { setTtsEnabled(checked); saveConfig("tts_enabled", String(checked)); }} />
          </div>

          <div className="stat-card !p-4 space-y-2">
            <div className="flex items-center gap-4">
              <Settings className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Texto do Loading</p>
                <p className="text-xs text-muted-foreground">Mensagem exibida enquanto consulta o produto</p>
              </div>
            </div>
            <Input
              value={loadingText}
              onChange={(e) => setLoadingText(e.target.value)}
              onBlur={(e) => saveConfig("loading_text", e.target.value.trim() || "Por favor aguarde, consultando o produto")}
              placeholder="Por favor aguarde, consultando o produto"
            />
          </div>

          <div className="stat-card !p-4 space-y-2">
            <div className="flex items-center gap-4">
              <Settings className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">API Mapeamento (URL)</p>
                <p className="text-xs text-muted-foreground">Endpoint usado pelo Terminal para buscar o mapeamento por empresa/loja</p>
              </div>
            </div>
            <Input
              value={mapeamentoApiUrl}
              onChange={(e) => setMapeamentoApiUrl(e.target.value)}
              onBlur={(e) => saveConfig("mapeamento_api_url", e.target.value.trim())}
              placeholder="https://.../mapeamento?..."
            />
          </div>

          <div className="stat-card !p-4 flex items-center gap-4">
            <Settings className="w-5 h-5 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Rodapé (Consulte o preço aqui)</p>
              <p className="text-xs text-muted-foreground">Mostra o rodapé apenas no modo idle (sem produto)</p>
            </div>
            <Switch checked={footerEnabled} onCheckedChange={(checked) => { setFooterEnabled(checked); saveConfig("footer_enabled", String(checked)); }} />
          </div>

          <div className="stat-card !p-4 flex items-center gap-4">
            <Settings className="w-5 h-5 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Relógio/Data no Rodapé</p>
              <p className="text-xs text-muted-foreground">Exibe data e hora no canto esquerdo</p>
            </div>
            <Switch checked={footerClockEnabled} onCheckedChange={(checked) => { setFooterClockEnabled(checked); saveConfig("footer_clock_enabled", String(checked)); }} />
          </div>

          <div className="stat-card !p-4 space-y-3">
            <div className="flex items-center gap-4">
              <Settings className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Códigos do Terminal (QR)</p>
                <p className="text-xs text-muted-foreground">Escaneie estes QR Codes no Terminal para executar ações rápidas</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <QrCodeTile label="Apagar cache (preços + imagens)" value="MUPA:CLEAR_CACHE" />
              <QrCodeTile label="Apagar cache de imagens sem fundo" value="MUPA:CLEAR_NOBG" />
              <QrCodeTile label="Recarregar Terminal" value="MUPA:RELOAD" />
              <QrCodeTile label="Voltar ao wizard" value="MUPA:RESET_WIZARD" />
              <QrCodeTile label="Focar no input" value="MUPA:FOCUS" />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="ghost" size="sm" onClick={resetConfigs} className="text-xs gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" />Resetar Configurações
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
