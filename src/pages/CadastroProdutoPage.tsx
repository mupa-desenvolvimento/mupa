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
  preco: z
    .number({ invalid_type_error: "Preço inválido" })
    .nonnegative("Preço deve ser ≥ 0"),
});

export default function CadastroProdutoPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ ean: "", nome: "", descricao: "", preco: "" });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = produtoSchema.safeParse({
      ean: form.ean,
      nome: form.nome,
      descricao: form.descricao || undefined,
      preco: form.preco === "" ? NaN : Number(form.preco.replace(",", ".")),
    });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "Dados inválidos");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("produtos").insert({
        ean: parsed.data.ean,
        nome: parsed.data.nome,
        descricao: parsed.data.descricao ?? null,
        preco: parsed.data.preco,
        disponivel: true,
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
      setForm({ ean: "", nome: "", descricao: "", preco: "" });
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

            <div className="space-y-2">
              <Label htmlFor="preco">Valor (R$) *</Label>
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
