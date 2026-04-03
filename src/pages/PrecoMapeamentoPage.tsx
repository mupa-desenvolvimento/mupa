import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ArrowRight, Key, Globe, Map, TestTube, Save, Loader2, CheckCircle2, AlertTriangle, Zap } from "lucide-react";

const CAMPOS_PADRAO = [
  { key: "nome", label: "Nome do Produto", descricao: "Campo com a descrição/nome do produto" },
  { key: "ean", label: "EAN / Código de Barras", descricao: "Campo com o código EAN" },
  { key: "imagem_url", label: "URL da Imagem", descricao: "Link da imagem do produto" },
  { key: "preco_regular", label: "Preço Regular", descricao: "Preço base/normal do produto" },
  { key: "preco_clube", label: "Preço Clube", descricao: "Preço especial para clientes clube" },
  { key: "preco_oferta", label: "Preço Oferta", descricao: "Preço promocional/oferta" },
  { key: "preco_proporcional", label: "Preço Proporcional", descricao: "Preço por unidade de medida (R$/KG, R$/LI)" },
  { key: "preco_proporcional_clube", label: "Preço Proporcional Clube", descricao: "Preço proporcional para clube" },
  { key: "unidade_proporcional", label: "Unidade Proporcional", descricao: "Unidade de medida proporcional (KG, LI, etc.)" },
  { key: "embalagem_venda", label: "Embalagem de Venda", descricao: "Tipo de embalagem (UN, CX, etc.)" },
  { key: "status", label: "Status", descricao: "Status de disponibilidade" },
  { key: "limite_compra", label: "Limite de Compra", descricao: "Quantidade máxima permitida" },
  { key: "codigo_etiqueta", label: "Código Etiqueta", descricao: "Tipo de etiqueta/promoção" },
  { key: "media_venda", label: "Média de Venda", descricao: "Preço médio de venda" },
];

const DEFAULT_MAPEAMENTO: Record<string, string> = {
  nome: "descricao_produto",
  ean: "ean",
  imagem_url: "link_imagem",
  preco_regular: "preco_base",
  preco_clube: "preco_clube",
  preco_oferta: "",
  preco_proporcional: "preco_prop_sellprice",
  preco_proporcional_clube: "preco_prop_clube",
  unidade_proporcional: "embalagem_proporcional",
  embalagem_venda: "embalagem_venda",
  status: "status_venda",
  limite_compra: "limite",
  codigo_etiqueta: "codigo_etiqueta",
  media_venda: "media_venda",
};

export default function PrecoMapeamentoPage() {
  const queryClient = useQueryClient();

  // Fetch empresas
  const { data: empresas } = useQuery({
    queryKey: ["empresas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const [selectedEmpresa, setSelectedEmpresa] = useState<string>("");

  // Fetch existing config
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["preco-config", selectedEmpresa],
    queryFn: async () => {
      if (!selectedEmpresa) return null;
      const { data, error } = await supabase
        .from("empresa_preco_config")
        .select("*")
        .eq("empresa_id", selectedEmpresa)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedEmpresa,
  });

  // Form state
  const [tokenUrl, setTokenUrl] = useState("");
  const [tokenMethod, setTokenMethod] = useState("POST");
  const [tokenBody, setTokenBody] = useState("{}");
  const [tokenHeaders, setTokenHeaders] = useState('{"Content-Type": "application/json"}');
  const [tokenResponsePath, setTokenResponsePath] = useState("token");
  const [tokenExpiryField, setTokenExpiryField] = useState("expires_in");
  const [tokenExpirySeconds, setTokenExpirySeconds] = useState("3600");

  const [consultaUrl, setConsultaUrl] = useState("");
  const [consultaMethod, setConsultaMethod] = useState("GET");
  const [consultaParamsFixos, setConsultaParamsFixos] = useState("{}");
  const [consultaEanParam, setConsultaEanParam] = useState("ean");
  const [consultaAuthType, setConsultaAuthType] = useState("bearer");
  const [dataPath, setDataPath] = useState("data");

  const [mapeamento, setMapeamento] = useState<Record<string, string>>(DEFAULT_MAPEAMENTO);
  const [ativo, setAtivo] = useState(true);

  // Test state
  const [testEan, setTestEan] = useState("7896436100581");
  const [testLoja, setTestLoja] = useState("");
  const [testResult, setTestResult] = useState<unknown>(null);
  const [testing, setTesting] = useState(false);

  // Populate form when config loads
  useEffect(() => {
    if (config) {
      setTokenUrl(config.token_url || "");
      setTokenMethod(config.token_method || "POST");
      setTokenBody(JSON.stringify(config.token_body, null, 2));
      setTokenHeaders(JSON.stringify(config.token_headers, null, 2));
      setTokenResponsePath(config.token_response_path || "token");
      setTokenExpiryField(config.token_expiry_field || "expires_in");
      setTokenExpirySeconds(String(config.token_expiry_seconds || 3600));
      setConsultaUrl(config.consulta_url || "");
      setConsultaMethod(config.consulta_method || "GET");
      setConsultaParamsFixos(JSON.stringify(config.consulta_params_fixos, null, 2));
      setConsultaEanParam(config.consulta_ean_param || "ean");
      setConsultaAuthType(config.consulta_auth_type || "bearer");
      setDataPath(config.data_path || "data");
      const campos = config.mapeamento_campos as Record<string, string> | null;
      setMapeamento(campos || DEFAULT_MAPEAMENTO);
      setAtivo(config.ativo ?? true);
    } else if (!configLoading && selectedEmpresa) {
      // Reset to defaults for new config
      setTokenUrl("");
      setTokenBody("{}");
      setTokenHeaders('{"Content-Type": "application/json"}');
      setTokenResponsePath("token");
      setTokenExpiryField("expires_in");
      setTokenExpirySeconds("3600");
      setConsultaUrl("");
      setConsultaParamsFixos("{}");
      setConsultaEanParam("ean");
      setDataPath("data");
      setMapeamento(DEFAULT_MAPEAMENTO);
      setAtivo(true);
    }
  }, [config, configLoading, selectedEmpresa]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      let bodyJson, headersJson, paramsJson;
      try { bodyJson = JSON.parse(tokenBody); } catch { throw new Error("Token Body JSON inválido"); }
      try { headersJson = JSON.parse(tokenHeaders); } catch { throw new Error("Token Headers JSON inválido"); }
      try { paramsJson = JSON.parse(consultaParamsFixos); } catch { throw new Error("Params Fixos JSON inválido"); }

      const payload = {
        empresa_id: selectedEmpresa,
        token_url: tokenUrl,
        token_method: tokenMethod,
        token_body: bodyJson,
        token_headers: headersJson,
        token_response_path: tokenResponsePath,
        token_expiry_field: tokenExpiryField,
        token_expiry_seconds: parseInt(tokenExpirySeconds) || 3600,
        consulta_url: consultaUrl,
        consulta_method: consultaMethod,
        consulta_params_fixos: paramsJson,
        consulta_ean_param: consultaEanParam,
        consulta_auth_type: consultaAuthType,
        data_path: dataPath,
        mapeamento_campos: mapeamento,
        ativo,
      };

      if (config?.id) {
        const { error } = await supabase
          .from("empresa_preco_config")
          .update(payload)
          .eq("id", config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("empresa_preco_config")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Configuração salva com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["preco-config"] });
    },
    onError: (e) => toast.error(e.message),
  });

  // Test mutation
  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const params = new URLSearchParams({ empresa_id: selectedEmpresa, ean: testEan });
      if (testLoja) params.set("loja", testLoja);

      const { data, error } = await supabase.functions.invoke("consulta-preco", {
        body: null,
        method: "GET",
      });

      // Use direct fetch since we need query params
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/consulta-preco?${params.toString()}`
      );
      const result = await resp.json();
      setTestResult(result);

      if (result.success) {
        toast.success("Teste realizado com sucesso!");
      } else {
        toast.error(result.error || "Erro no teste");
      }
    } catch (e) {
      setTestResult({ error: e instanceof Error ? e.message : "Erro" });
      toast.error("Erro ao executar teste");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Mapeamento de Preços</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure a integração com APIs de consulta de preços por empresa
          </p>
        </div>
      </div>

      {/* Empresa selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Label className="whitespace-nowrap font-medium">Empresa:</Label>
            <Select value={selectedEmpresa} onValueChange={setSelectedEmpresa}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Selecione uma empresa" />
              </SelectTrigger>
              <SelectContent>
                {empresas?.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {config && (
              <Badge variant={config.ativo ? "default" : "secondary"}>
                {config.ativo ? "Ativo" : "Inativo"}
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Label htmlFor="ativo-switch" className="text-sm">Ativo</Label>
              <Switch id="ativo-switch" checked={ativo} onCheckedChange={setAtivo} />
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedEmpresa && (
        <Tabs defaultValue="token" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="token" className="flex items-center gap-2">
              <Key className="h-4 w-4" /> Token
            </TabsTrigger>
            <TabsTrigger value="consulta" className="flex items-center gap-2">
              <Globe className="h-4 w-4" /> Consulta
            </TabsTrigger>
            <TabsTrigger value="mapeamento" className="flex items-center gap-2">
              <Map className="h-4 w-4" /> Mapeamento
            </TabsTrigger>
            <TabsTrigger value="teste" className="flex items-center gap-2">
              <TestTube className="h-4 w-4" /> Teste
            </TabsTrigger>
          </TabsList>

          {/* TOKEN TAB */}
          <TabsContent value="token">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-primary" />
                  Configuração do Token
                </CardTitle>
                <CardDescription>
                  Configure como obter e renovar o token de autenticação da API
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>URL do Token</Label>
                    <Input
                      value={tokenUrl}
                      onChange={(e) => setTokenUrl(e.target.value)}
                      placeholder="https://api.exemplo.com/login"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Método HTTP</Label>
                    <Select value={tokenMethod} onValueChange={setTokenMethod}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="GET">GET</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Body (JSON) — credenciais de autenticação</Label>
                  <textarea
                    className="w-full h-32 rounded-md border bg-background px-3 py-2 text-sm font-mono"
                    value={tokenBody}
                    onChange={(e) => setTokenBody(e.target.value)}
                    placeholder='{"usuario": "...", "password": "..."}'
                  />
                </div>

                <div className="space-y-2">
                  <Label>Headers (JSON)</Label>
                  <textarea
                    className="w-full h-20 rounded-md border bg-background px-3 py-2 text-sm font-mono"
                    value={tokenHeaders}
                    onChange={(e) => setTokenHeaders(e.target.value)}
                  />
                </div>

                <Separator />

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Caminho do Token na Resposta</Label>
                    <Input
                      value={tokenResponsePath}
                      onChange={(e) => setTokenResponsePath(e.target.value)}
                      placeholder="token"
                    />
                    <p className="text-xs text-muted-foreground">Ex: "token", "data.access_token"</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Campo de Expiração</Label>
                    <Input
                      value={tokenExpiryField}
                      onChange={(e) => setTokenExpiryField(e.target.value)}
                      placeholder="expires_in"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Expiração Padrão (segundos)</Label>
                    <Input
                      type="number"
                      value={tokenExpirySeconds}
                      onChange={(e) => setTokenExpirySeconds(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CONSULTA TAB */}
          <TabsContent value="consulta">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" />
                  Configuração da Consulta
                </CardTitle>
                <CardDescription>
                  Configure o endpoint de consulta de preço do produto
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>URL de Consulta</Label>
                    <Input
                      value={consultaUrl}
                      onChange={(e) => setConsultaUrl(e.target.value)}
                      placeholder="https://api.exemplo.com/v1/consulta/precos"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Método HTTP</Label>
                    <Select value={consultaMethod} onValueChange={setConsultaMethod}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="POST">POST</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome do Parâmetro EAN</Label>
                    <Input
                      value={consultaEanParam}
                      onChange={(e) => setConsultaEanParam(e.target.value)}
                      placeholder="ean"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de Autenticação</Label>
                    <Select value={consultaAuthType} onValueChange={setConsultaAuthType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bearer">Bearer Token</SelectItem>
                        <SelectItem value="basic">Basic Auth</SelectItem>
                        <SelectItem value="header">Custom Header</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Parâmetros Fixos (JSON)</Label>
                  <textarea
                    className="w-full h-20 rounded-md border bg-background px-3 py-2 text-sm font-mono"
                    value={consultaParamsFixos}
                    onChange={(e) => setConsultaParamsFixos(e.target.value)}
                    placeholder='{"loja": "51"}'
                  />
                  <p className="text-xs text-muted-foreground">Parâmetros que serão enviados em toda consulta (ex: loja)</p>
                </div>

                <div className="space-y-2">
                  <Label>Caminho dos Dados na Resposta</Label>
                  <Input
                    value={dataPath}
                    onChange={(e) => setDataPath(e.target.value)}
                    placeholder="data"
                  />
                  <p className="text-xs text-muted-foreground">Caminho no JSON de resposta onde estão os dados do produto. Ex: "data", "resultado.produto"</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* MAPEAMENTO TAB */}
          <TabsContent value="mapeamento">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Map className="h-5 w-5 text-primary" />
                  Mapeamento de Campos
                </CardTitle>
                <CardDescription>
                  Mapeie os campos da resposta da API para o formato padrão do terminal.
                  Deixe vazio campos que não existem na API.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {/* Header */}
                  <div className="grid grid-cols-[1fr_40px_1fr_1fr] gap-3 px-3 py-2 bg-muted rounded-t-md">
                    <span className="text-xs font-medium text-muted-foreground uppercase">Campo Padrão</span>
                    <span />
                    <span className="text-xs font-medium text-muted-foreground uppercase">Campo na API</span>
                    <span className="text-xs font-medium text-muted-foreground uppercase">Descrição</span>
                  </div>

                  {CAMPOS_PADRAO.map((campo) => (
                    <div
                      key={campo.key}
                      className="grid grid-cols-[1fr_40px_1fr_1fr] gap-3 px-3 py-2 items-center border-b border-border/50 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant={campo.key.includes("preco") ? "default" : "outline"} className="text-xs">
                          {campo.label}
                        </Badge>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground mx-auto" />
                      <Input
                        className="h-8 text-sm font-mono"
                        value={mapeamento[campo.key] || ""}
                        onChange={(e) => setMapeamento(prev => ({ ...prev, [campo.key]: e.target.value }))}
                        placeholder="campo_da_api"
                      />
                      <p className="text-xs text-muted-foreground">{campo.descricao}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TESTE TAB */}
          <TabsContent value="teste">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TestTube className="h-5 w-5 text-primary" />
                    Testar Consulta
                  </CardTitle>
                  <CardDescription>
                    Teste a configuração com um EAN real
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>EAN para Teste</Label>
                    <Input
                      value={testEan}
                      onChange={(e) => setTestEan(e.target.value)}
                      placeholder="7896436100581"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Loja (opcional, sobrescreve param fixo)</Label>
                    <Input
                      value={testLoja}
                      onChange={(e) => setTestLoja(e.target.value)}
                      placeholder="51"
                    />
                  </div>
                  <Button onClick={runTest} disabled={testing || !testEan} className="w-full">
                    {testing ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Testando...</>
                    ) : (
                      <><Zap className="h-4 w-4 mr-2" /> Executar Teste</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Resultado</CardTitle>
                </CardHeader>
                <CardContent>
                  {testResult ? (
                    <div className="space-y-4">
                      {(testResult as any)?.success && (testResult as any)?.produto?.precos && (
                        <div className="space-y-2">
                          <h4 className="font-medium flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            {(testResult as any).produto.nome}
                          </h4>
                          <p className="text-xs text-muted-foreground">EAN: {(testResult as any).produto.ean}</p>

                          <div className="space-y-1 mt-3">
                            {(testResult as any).produto.precos.map((p: any, i: number) => (
                              <div
                                key={i}
                                className={`flex items-center justify-between px-3 py-2 rounded-md ${
                                  p.destaque ? 'bg-primary/10 border border-primary/30' : 'bg-muted/50'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <Badge variant={p.destaque ? "default" : "outline"} className="text-xs">
                                    {p.tipo}
                                  </Badge>
                                  <span className="text-sm">{p.label}</span>
                                </div>
                                <span className={`font-bold ${p.destaque ? 'text-primary text-lg' : ''}`}>
                                  R$ {p.valor.toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {(testResult as any)?.error && (
                        <div className="flex items-start gap-2 text-destructive">
                          <AlertTriangle className="h-4 w-4 mt-0.5" />
                          <span className="text-sm">{(testResult as any).error}</span>
                        </div>
                      )}

                      <Separator />
                      <details>
                        <summary className="text-xs text-muted-foreground cursor-pointer">Resposta completa (JSON)</summary>
                        <pre className="mt-2 text-xs bg-muted p-3 rounded-md overflow-auto max-h-80 font-mono">
                          {JSON.stringify(testResult, null, 2)}
                        </pre>
                      </details>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Execute um teste para ver o resultado
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Save button */}
      {selectedEmpresa && (
        <div className="flex justify-end">
          <Button
            size="lg"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !tokenUrl || !consultaUrl}
          >
            {saveMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Salvando...</>
            ) : (
              <><Save className="h-4 w-4 mr-2" /> Salvar Configuração</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
