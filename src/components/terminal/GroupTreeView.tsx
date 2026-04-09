import { useCallback, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Folder, Monitor, Plus, Trash2, Pencil, Link2 } from "lucide-react";

type GrupoRow = {
  id: string;
  nome: string;
  parent_id: string | null;
  playlist_id: string | null;
};

type PlaylistRow = { id: string; nome: string; ativo: boolean };

type DispositivoRow = {
  id: string;
  nome: string;
  grupo_id: string | null;
  config_override?: unknown;
  ativo?: boolean;
  ultimo_acesso?: string | null;
};

type TreeGroupNode = {
  group: GrupoRow;
  children: TreeGroupNode[];
  devices: DispositivoRow[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function normalizeQuery(v: string) {
  return String(v ?? "").trim().toLowerCase();
}

function isOnline(ultimoAcesso: string | null | undefined) {
  const ts = ultimoAcesso ? Date.parse(ultimoAcesso) : NaN;
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= 5 * 60 * 1000;
}

function resolveEffectivePlaylistId(groupId: string, gruposById: Map<string, GrupoRow>): string | null {
  let gid: string | null = groupId;
  for (let i = 0; i < 24 && gid; i += 1) {
    const g = gruposById.get(gid);
    if (!g) return null;
    if (g.playlist_id) return g.playlist_id;
    gid = g.parent_id;
  }
  return null;
}

function isAncestor(ancestorId: string, childId: string, gruposById: Map<string, GrupoRow>) {
  let gid: string | null = childId;
  for (let i = 0; i < 32 && gid; i += 1) {
    if (gid === ancestorId) return true;
    const g = gruposById.get(gid);
    gid = g?.parent_id ?? null;
  }
  return false;
}

function buildTree(grupos: GrupoRow[], dispositivos: DispositivoRow[]) {
  const gruposById = new Map(grupos.map((g) => [g.id, g]));
  const childrenByParent = new Map<string | null, GrupoRow[]>();
  for (const g of grupos) {
    const parent = g.parent_id ?? null;
    const list = childrenByParent.get(parent) ?? [];
    list.push(g);
    childrenByParent.set(parent, list);
  }
  for (const [k, list] of childrenByParent.entries()) {
    list.sort((a, b) => a.nome.localeCompare(b.nome));
    childrenByParent.set(k, list);
  }

  const devicesByGroup = new Map<string, DispositivoRow[]>();
  for (const d of dispositivos) {
    if (!d.grupo_id) continue;
    const list = devicesByGroup.get(d.grupo_id) ?? [];
    list.push(d);
    devicesByGroup.set(d.grupo_id, list);
  }
  for (const [k, list] of devicesByGroup.entries()) {
    list.sort((a, b) => a.nome.localeCompare(b.nome));
    devicesByGroup.set(k, list);
  }

  const buildNode = (g: GrupoRow): TreeGroupNode => {
    const children = (childrenByParent.get(g.id) ?? []).map(buildNode);
    const devices = devicesByGroup.get(g.id) ?? [];
    return { group: g, children, devices };
  };

  const roots = (childrenByParent.get(null) ?? []).map(buildNode);
  return { roots, gruposById };
}

function getGroupPathIds(groupId: string, gruposById: Map<string, GrupoRow>) {
  const ids: string[] = [];
  let gid: string | null = groupId;
  for (let i = 0; i < 32 && gid; i += 1) {
    ids.push(gid);
    const g = gruposById.get(gid);
    gid = g?.parent_id ?? null;
  }
  return ids;
}

function flattenGroups(nodes: TreeGroupNode[]) {
  const out: TreeGroupNode[] = [];
  const walk = (n: TreeGroupNode) => {
    out.push(n);
    for (const c of n.children) walk(c);
  };
  for (const r of nodes) walk(r);
  return out;
}

export function GroupTreeView({
  grupos,
  playlists,
  dispositivos,
}: {
  grupos: GrupoRow[];
  playlists: PlaylistRow[];
  dispositivos: DispositivoRow[];
}) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const q = normalizeQuery(query);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [createPlaylistId, setCreatePlaylistId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const { roots, gruposById } = useMemo(() => buildTree(grupos, dispositivos), [grupos, dispositivos]);
  const playlistsById = useMemo(() => new Map(playlists.map((p) => [p.id, p])), [playlists]);

  const matches = useMemo(() => {
    if (!q) return { groupIds: new Set<string>(), deviceIds: new Set<string>() };
    const groupIds = new Set<string>();
    const deviceIds = new Set<string>();
    for (const g of grupos) {
      if (g.nome.toLowerCase().includes(q)) groupIds.add(g.id);
    }
    for (const d of dispositivos) {
      if (d.nome.toLowerCase().includes(q)) {
        deviceIds.add(d.id);
        if (d.grupo_id) groupIds.add(d.grupo_id);
      }
    }
    return { groupIds, deviceIds };
  }, [dispositivos, grupos, q]);

  const visibleGroupIds = useMemo(() => {
    if (!q) return null;
    const ids = new Set<string>();
    for (const gid of matches.groupIds) {
      for (const p of getGroupPathIds(gid, gruposById)) ids.add(p);
    }
    return ids;
  }, [gruposById, matches.groupIds, q]);

  const ensureExpandedForSearch = useMemo(() => {
    if (!q || !visibleGroupIds) return null;
    const ids = new Set<string>();
    for (const gid of visibleGroupIds) ids.add(gid);
    return ids;
  }, [q, visibleGroupIds]);

  const isExpanded = useCallback((id: string) => {
    if (ensureExpandedForSearch) return ensureExpandedForSearch.has(id);
    return expanded.has(id);
  }, [ensureExpandedForSearch, expanded]);

  const toggleExpanded = useCallback((id: string) => {
    if (ensureExpandedForSearch) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [ensureExpandedForSearch]);

  const createGrupo = useMutation({
    mutationFn: async (args: { nome: string; parent_id: string | null; playlist_id: string | null }) => {
      const { error } = await supabase.from("dispositivo_grupos").insert({
        nome: args.nome,
        parent_id: args.parent_id,
        playlist_id: args.playlist_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispositivo-grupos"] });
      toast.success("Grupo criado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateGrupo = useMutation({
    mutationFn: async (args: { id: string; nome: string; parent_id: string | null; playlist_id: string | null }) => {
      const { error } = await supabase.from("dispositivo_grupos").update({
        nome: args.nome,
        parent_id: args.parent_id,
        playlist_id: args.playlist_id,
      }).eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispositivo-grupos"] });
      toast.success("Grupo atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteGrupo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dispositivo_grupos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispositivo-grupos"] });
      toast.success("Grupo removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateDispositivoGrupo = useMutation({
    mutationFn: async ({ id, grupo_id }: { id: string; grupo_id: string | null }) => {
      const { error } = await supabase.from("dispositivos").update({ grupo_id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispositivos-lite"] });
      toast.success("Dispositivo atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = useCallback((parentId: string | null) => {
    setCreateName("");
    setCreatePlaylistId(null);
    setCreateParentId(parentId);
    setCreateOpen(true);
  }, []);

  const saveCreate = useCallback(() => {
    const nome = createName.trim();
    if (!nome) return;
    createGrupo.mutate({ nome, parent_id: createParentId, playlist_id: createPlaylistId });
    setCreateOpen(false);
  }, [createGrupo, createName, createParentId, createPlaylistId]);

  const beginEdit = useCallback((g: GrupoRow) => {
    setEditingGroupId(g.id);
    setEditingName(g.nome);
  }, []);

  const saveEdit = useCallback(() => {
    const gid = editingGroupId;
    if (!gid) return;
    const g = gruposById.get(gid);
    if (!g) return;
    const nome = editingName.trim();
    if (!nome || nome === g.nome) {
      setEditingGroupId(null);
      return;
    }
    updateGrupo.mutate({ id: g.id, nome, parent_id: g.parent_id, playlist_id: g.playlist_id });
    setEditingGroupId(null);
  }, [editingGroupId, editingName, gruposById, updateGrupo]);

  const renderGroup = useCallback((node: TreeGroupNode, depth: number) => {
    const g = node.group;
    if (visibleGroupIds && !visibleGroupIds.has(g.id)) return null;

    const expandedNow = isExpanded(g.id);
    const effectivePlaylistId = resolveEffectivePlaylistId(g.id, gruposById);
    const effectivePlaylist = effectivePlaylistId ? playlistsById.get(effectivePlaylistId) ?? null : null;
    const hasChildren = node.children.length > 0 || node.devices.length > 0;
    const paddingLeft = 10 + depth * 18;

    return (
      <div key={g.id}>
        <div
          className={`rounded-lg border px-2 py-2 bg-background ${selectedGroupId === g.id ? "ring-2 ring-primary/40" : ""}`}
          style={{ paddingLeft }}
          onClick={() => setSelectedGroupId(g.id)}
        >
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (hasChildren) toggleExpanded(g.id); }}
              disabled={!hasChildren || !!ensureExpandedForSearch}
            >
              {hasChildren ? (expandedNow ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <span className="w-4" />}
            </Button>

            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
              {editingGroupId === g.id ? (
                <Input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={saveEdit}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveEdit(); } }}
                  className="h-8"
                  autoFocus
                />
              ) : (
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{g.nome}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {effectivePlaylist ? `Playlist: ${effectivePlaylist.nome}` : "Playlist: Mídia padrão"}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="secondary" className="hidden sm:inline-flex">
                {effectivePlaylist ? effectivePlaylist.nome : "Mídia padrão"}
              </Badge>

              <Select
                value={g.playlist_id ?? "inherit"}
                onValueChange={(v) => {
                  updateGrupo.mutate({ id: g.id, nome: g.nome, parent_id: g.parent_id, playlist_id: v === "inherit" ? null : v });
                }}
              >
                <SelectTrigger className="h-8 w-[180px] hidden md:flex">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">{g.parent_id ? "Herdar do pai" : "Sem playlist"}</SelectItem>
                  {playlists.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}{p.ativo ? "" : " (inativa)"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="hidden lg:inline-flex"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); openCreate(g.id); }}
              >
                <Plus className="h-4 w-4 mr-2" />Criar subgrupo
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!expandedNow) toggleExpanded(g.id); }}
              >
                <Link2 className="h-4 w-4 mr-2" />Vincular
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); beginEdit(g); }}
              >
                <Pencil className="h-4 w-4" />
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover grupo?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Isso remove o grupo. Dispositivos vinculados ficarão sem grupo.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteGrupo.mutate(g.id)}>Remover</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {expandedNow ? (
            <div className="mt-2 space-y-2">
              {node.children.map((c) => renderGroup(c, depth + 1))}

              {node.devices.length > 0 ? (
                <div className="space-y-1.5">
                  {node.devices.map((d) => {
                    const o = asRecord(d.config_override);
                    const overridePlaylistId = typeof o?.playlist_id === "string" && o.playlist_id ? o.playlist_id : null;
                    const overridePlaylist = overridePlaylistId ? playlistsById.get(overridePlaylistId) ?? null : null;
                    const online = isOnline(d.ultimo_acesso);
                    const badgeLabel = overridePlaylist ? overridePlaylist.nome : effectivePlaylist ? effectivePlaylist.nome : "Mídia padrão";
                    return (
                      <div
                        key={d.id}
                        className="rounded-md border bg-background px-3 py-2 flex items-center justify-between gap-3"
                        style={{ marginLeft: 10 + (depth + 1) * 18 }}
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <Monitor className="h-4 w-4 text-muted-foreground" />
                          <div className="text-sm font-medium truncate">{d.nome}</div>
                          <Badge variant="outline" className="text-[10px]">{badgeLabel}</Badge>
                          <Badge variant={online ? "default" : "secondary"} className={online ? "bg-green-600 hover:bg-green-600" : ""}>
                            {online ? "Online" : "Offline"}
                          </Badge>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateDispositivoGrupo.mutate({ id: d.id, grupo_id: null })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground" style={{ marginLeft: 10 + (depth + 1) * 18 }}>
                  Nenhum dispositivo vinculado
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2" style={{ marginLeft: 10 + (depth + 1) * 18 }}>
                <Select
                  value={g.parent_id ?? "none"}
                  onValueChange={(v) => {
                    const nextParent = v === "none" ? null : v;
                    if (nextParent && (nextParent === g.id || isAncestor(g.id, nextParent, gruposById))) {
                      toast.error("Não é possível mover um grupo para dentro dele mesmo");
                      return;
                    }
                    updateGrupo.mutate({ id: g.id, nome: g.nome, parent_id: nextParent, playlist_id: g.playlist_id });
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Pai" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem pai</SelectItem>
                    {grupos.filter((x) => x.id !== g.id).map((x) => (
                      <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value=""
                  onValueChange={(deviceId) => updateDispositivoGrupo.mutate({ id: deviceId, grupo_id: g.id })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="+ Vincular dispositivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {dispositivos.filter((d) => d.grupo_id !== g.id).slice(0, 200).map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }, [
    beginEdit,
    deleteGrupo,
    dispositivos,
    editingGroupId,
    editingName,
    ensureExpandedForSearch,
    grupos,
    gruposById,
    isExpanded,
    openCreate,
    playlists,
    playlistsById,
    saveEdit,
    selectedGroupId,
    toggleExpanded,
    updateDispositivoGrupo,
    updateGrupo,
    visibleGroupIds,
  ]);

  const allNodes = useMemo(() => flattenGroups(roots), [roots]);
  const topCount = allNodes.length;
  const deviceCount = dispositivos.length;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Grupos</div>
              <div className="text-xs text-muted-foreground">
                {topCount} grupo(s) • {deviceCount} dispositivo(s)
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar grupo ou dispositivo..." className="sm:w-[320px]" />
            </div>
            <Button onClick={() => openCreate(selectedGroupId)} disabled={createGrupo.isPending}>
              <Plus className="h-4 w-4 mr-2" />Criar Grupo
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="p-4 min-h-[520px]">
          <ScrollArea className="h-[70vh] pr-2">
            <div className="space-y-2">
              {roots.length === 0 ? (
                <div className="text-sm text-muted-foreground py-10 text-center">Nenhum grupo criado</div>
              ) : (
                roots.map((r) => renderGroup(r, 0))
              )}
            </div>
          </ScrollArea>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="text-sm font-semibold">Resumo rápido</div>
            <div className="text-xs text-muted-foreground mt-1">
              Clique em um grupo para ver os dispositivos e ajustar playlist/herança.
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Selecionado</span>
                <span className="font-medium">{selectedGroupId ? gruposById.get(selectedGroupId)?.nome ?? "—" : "—"}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Criar como filho</span>
                <span className="font-medium">{selectedGroupId ? "Sim" : "Não (raiz)"}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Criar grupo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="text-sm font-medium">Nome</div>
              <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Ex: Lojas Passo Fundo" />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="text-sm font-medium">Pai</div>
                <Select value={createParentId ?? "none"} onValueChange={(v) => setCreateParentId(v === "none" ? null : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sem pai" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem pai</SelectItem>
                    {grupos.map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <div className="text-sm font-medium">Playlist</div>
                <Select value={createPlaylistId ?? "inherit"} onValueChange={(v) => setCreatePlaylistId(v === "inherit" ? null : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Herdar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inherit">{createParentId ? "Herdar do pai" : "Sem playlist"}</SelectItem>
                    {playlists.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}{p.ativo ? "" : " (inativa)"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button onClick={saveCreate} disabled={createGrupo.isPending}>Criar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
