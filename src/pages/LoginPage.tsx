import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { LogIn, UserPlus } from "lucide-react";
import { VirtualKeyboard } from "@/components/virtual-keyboard/VirtualKeyboard";
import { suppressNativeKeyboardProps } from "@/components/virtual-keyboard/suppressNativeKeyboard";

type FocusField = "email" | "password";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<FocusField>("email");
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast({ title: "Conta criada com sucesso!", description: "Você já está logado." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: "Erro",
        description: message === "Invalid login credentials"
          ? "E-mail ou senha inválidos"
          : message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const append = useCallback(
    (char: string) => {
      if (focusedField === "email") setEmail((v) => v + char);
      else setPassword((v) => v + char);
    },
    [focusedField],
  );

  const backspace = useCallback(() => {
    if (focusedField === "email") setEmail((v) => v.slice(0, -1));
    else setPassword((v) => v.slice(0, -1));
  }, [focusedField]);

  const onKeyboardEnter = useCallback(() => {
    if (focusedField === "email") {
      setFocusedField("password");
      return;
    }
    const form = document.getElementById("login-form");
    if (form instanceof HTMLFormElement) form.requestSubmit();
  }, [focusedField]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <div className="flex flex-1 items-center justify-center p-4 pb-2">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Mupa Admin</CardTitle>
            <CardDescription>
              {isSignUp ? "Crie sua conta para acessar o painel" : "Faça login para acessar o painel"}
            </CardDescription>
            <p className="text-xs text-muted-foreground pt-1">
              Use o teclado na parte inferior — o teclado do sistema está desativado nesta tela.
            </p>
          </CardHeader>
          <CardContent>
            <form id="login-form" onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField("email")}
                  required
                  className={focusedField === "email" ? "ring-2 ring-ring" : ""}
                  {...suppressNativeKeyboardProps}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField("password")}
                  required
                  minLength={6}
                  className={focusedField === "password" ? "ring-2 ring-ring" : ""}
                  {...suppressNativeKeyboardProps}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Aguarde..." : isSignUp ? (
                  <><UserPlus className="mr-2 h-4 w-4" /> Criar conta</>
                ) : (
                  <><LogIn className="mr-2 h-4 w-4" /> Entrar</>
                )}
              </Button>
            </form>
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-sm text-muted-foreground hover:text-foreground underline"
              >
                {isSignUp ? "Já tem conta? Faça login" : "Não tem conta? Cadastre-se"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      <VirtualKeyboard
        mode="full"
        onKey={append}
        onBackspace={backspace}
        onEnter={onKeyboardEnter}
        className="shrink-0"
      />
    </div>
  );
}
