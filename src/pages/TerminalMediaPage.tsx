import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, Trash2, GripVertical, Image, Video, ExternalLink, Settings, Volume2, Bell } from "lucide-react";
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

export default function TerminalMediaPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [tipoSugestao, setTipoSugestao] = useState("complementares");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const fetchConfig = async () => {
      const { data } = await supabase
        .from("terminal_config")
        .select("valor")
        .eq("chave", "tipo_sugestao")
        .maybeSingle();
      if (data?.valor) setTipoSugestao(data.valor);
    };
    fetchConfig();
  }, []);

  const saveTipoSugestao = async (value: string) => {
    setTipoSugestao(value);
    const { error } = await supabase
      .from("terminal_config")
      .upsert({ chave: "tipo_sugestao", valor: value, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
    if (error) toast.error("Erro ao salvar configuração");
    else toast.success("Tipo de sugestão salvo");
  };

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

    // Optimistic update
    queryClient.setQueryData(["terminal-media"], reordered);

    // Persist new order
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

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Mídia do Terminal</h1>
          <p className="text-muted-foreground mt-1">
            Imagens e vídeos exibidos nos terminais quando não há consulta ativa
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/terminal" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink className="w-4 h-4 mr-2" />
              Ver Terminal
            </Button>
          </a>
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? "Enviando..." : "Upload"}
          </Button>
        </div>
      </div>

      <div className="stat-card !p-4 flex items-center gap-4">
        <Settings className="w-5 h-5 text-muted-foreground shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium">Tipo de Sugestão no Terminal</p>
          <p className="text-xs text-muted-foreground">Define quais sugestões aparecem ao consultar um produto</p>
        </div>
        <Select value={tipoSugestao} onValueChange={saveTipoSugestao}>
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

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={handleUpload}
      />

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
    </div>
  );
}
