import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PackagePlus } from "lucide-react";

const produtoSchema = z.object({
  ean: z
    .string()
    .trim()
    .min(6, "EAN deve ter ao menos 6 dígitos")
    .max(20, "EAN inválido")
    .regex(/^\d+$/, "EAN deve conter apenas números"),
  nome: z.string().trim().min(2, "Informe o nome").max(200, "Máx. 200 caracteres"),
  descricao: z.string().trim().max(2000, "Máx. 2000 caracteres").optional(),
  imagem_url: z
    .string()
    .trim()
    .url("URL da imagem inválida")
    .max(2000, "URL muito longa")
    .optional()
    .or(z.literal("")),
  preco: z
    .number({ invalid_type_error: "Preço inválido" })
    .nonnegative("Preço deve ser ≥ 0"),
  preco_oferta: z
    .number({ invalid_type_error: "Preço em oferta inválido" })
    .nonnegative("Preço em oferta deve ser ≥ 0")
    .optional(),
});

export default function CadastroProdutoPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    ean: "",
    nome: "",
    descricao: "",
    preco: "",
    preco_oferta: "",
    imagem_url: "",
  });
  const [saving, setSaving] = useState(false);

  const parseNumber = (v: string) => (v === "" ? undefined : Number(v.replace(",", ".")));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const precoNum = form.preco === "" ? NaN : Number(form.preco.replace(",", "."));
    const ofertaNum = parseNumber(form.preco_oferta);
    const parsed = produtoSchema.safeParse({
      ean: form.ean,
      nome: form.nome,
      descricao: form.descricao || undefined,
      imagem_url: form.imagem_url || undefined,
      preco: precoNum,
      preco_oferta: ofertaNum,
    });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "Dados inválidos");
      return;
    }
    if (parsed.data.preco_oferta !== undefined && parsed.data.preco_oferta >= parsed.data.preco) {
      toast.error("O preço em oferta deve ser menor que o preço normal");
      return;
    }
    setSaving(true);
    try {
      const imagemUrl = parsed.data.imagem_url && parsed.data.imagem_url !== "" ? parsed.data.imagem_url : null;
      const hasOferta = parsed.data.preco_oferta !== undefined;
      const { error } = await supabase.from("produtos").insert({
        ean: parsed.data.ean,
        nome: parsed.data.nome,
        descricao: parsed.data.descricao ?? null,
        preco: hasOferta ? parsed.data.preco_oferta! : parsed.data.preco,
        preco_lista: hasOferta ? parsed.data.preco : null,
        disponivel: true,
        imagem_url_vtex: imagemUrl,
      });
      if (error) {
        if (error.code === "23505") {
          toast.error("Já existe um produto com este EAN.");
        } else {
          toast.error(error.message);
        }
        return;
      }
      toast.success("Produto cadastrado com sucesso!");
      setForm({ ean: "", nome: "", descricao: "", preco: "", preco_oferta: "", imagem_url: "" });
      navigate("/catalogo");
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <PackagePlus className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display">Cadastrar Produto</h1>
          <p className="text-sm text-muted-foreground">
            Adicione um produto manualmente ao catálogo
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados do produto</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ean">EAN *</Label>
              <Input
                id="ean"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ex.: 7891234567890"
                value={form.ean}
                onChange={(e) => setForm({ ...form, ean: e.target.value.replace(/\D/g, "") })}
                maxLength={20}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                placeholder="Nome do produto"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                maxLength={200}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea
                id="descricao"
                placeholder="Descrição detalhada do produto (opcional)"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                rows={4}
                maxLength={2000}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="preco">Preço (R$) *</Label>
                <Input
                  id="preco"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.preco}
                  onChange={(e) =>
                    setForm({ ...form, preco: e.target.value.replace(/[^\d.,]/g, "") })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="preco_oferta">Preço em oferta (R$)</Label>
                <Input
                  id="preco_oferta"
                  inputMode="decimal"
                  placeholder="opcional"
                  value={form.preco_oferta}
                  onChange={(e) =>
                    setForm({ ...form, preco_oferta: e.target.value.replace(/[^\d.,]/g, "") })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Se preenchido, deve ser menor que o preço normal.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="imagem_url">URL da imagem</Label>
              <Input
                id="imagem_url"
                type="url"
                inputMode="url"
                placeholder="https://exemplo.com/imagem.jpg"
                value={form.imagem_url}
                onChange={(e) => setForm({ ...form, imagem_url: e.target.value })}
                maxLength={2000}
              />
              <div className="aspect-square w-full max-w-[220px] rounded-lg border bg-muted overflow-hidden flex items-center justify-center">
                {form.imagem_url ? (
                  <img
                    src={form.imagem_url}
                    alt="Pré-visualização"
                    className="h-full w-full object-contain p-2"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                    }}
                  />
                ) : (
                  <PackagePlus className="h-10 w-10 text-muted-foreground/40" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Opcional. Cole o link público de uma imagem (JPG, PNG ou WEBP).
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving} className="flex-1">
                {saving ? "A guardar..." : "Cadastrar produto"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/catalogo")}
                disabled={saving}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
