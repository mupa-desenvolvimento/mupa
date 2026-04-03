import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import LinearGradient from "react-native-linear-gradient";
import SystemNavigationBar from "react-native-system-navigation-bar";
import { disallowScreenshot, keepAwake } from "react-native-screen-capture";
import DeviceInfo from "react-native-device-info";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SystemBars } from "react-native-edge-to-edge";
import Sound from "react-native-sound";

import { ADMIN, FUNCTIONS_BASE_URL, TERMINAL_CONFIG } from "../config";
import { extractThemeFromImage, ProductTheme } from "../lib/colors";
import { formatPrice, normalizeProductName, splitHighlight } from "../lib/format";
import {
  applyDeviceOwnerPolicies,
  clearDeviceOwnerPolicies,
  enterKioskMode,
  exitKioskMode,
  isDeviceOwnerApp,
  isKioskModeActive,
  setImmersive,
  setScreenSecure,
} from "../native/Kiosk";

type Produto = {
  ean: string;
  nome: string;
  nome_curto?: string | null;
  marca?: string | null;
  categoria?: string | null;
  preco?: number | null;
  preco_lista?: number | null;
  disponivel?: boolean | null;
  imagem_url_vtex?: string | null;
  unidade_medida?: string | null;
};

type Sugestao = Produto & { motivo?: string };

type Sugestoes = {
  mesma_marca: Sugestao[];
  complementares: Sugestao[];
  perfil: Sugestao[];
};

const FALLBACK_THEME: ProductTheme = {
  primary: "#c0392b",
  secondary: "#8e44ad",
  accent: "#e74c3c",
  background: ["#f5f0ef", "#f8f2f1", "#faf6f5"],
  textColor: "#1a1a1a",
  textMuted: "rgba(0,0,0,0.55)",
  containerGradient: ["#f2dcd8", "#f7ecea"],
  priceGradient: ["#8e44ad", "#6e328c"],
};

function clamp(min: number, value: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function useExactViewport() {
  const [v, setV] = useState(() => {
    const window = Dimensions.get("window");
    return { width: Math.round(window.width), height: Math.round(window.height) };
  });

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => {
      setV({ width: Math.round(window.width), height: Math.round(window.height) });
    });
    return () => sub.remove();
  }, []);

  return v;
}

function playRemoteAudio(url: string) {
  return new Promise<void>((resolve) => {
    const sound = new Sound(url, "", (error) => {
      if (error) return resolve();
      sound.play(() => {
        sound.release();
        resolve();
      });
    });
  });
}

export function TerminalScreen() {
  const insets = useSafeAreaInsets();
  const { width: vw, height: vh } = useExactViewport();
  const isLandscape = vh < vw;
  const minDim = Math.min(vw, vh);
  const padding = Math.round(minDim * 0.03);
  const gap = Math.round(minDim * 0.024);
  const footerSpace = Math.round(clamp(44, vh * 0.085, 96));

  const [ean, setEan] = useState("");
  const [produto, setProduto] = useState<Produto | null>(null);
  const [sugestoes, setSugestoes] = useState<Sugestoes | null>(null);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<ProductTheme>(FALLBACK_THEME);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const footerTapRef = useRef<{ count: number; ts: number }>({ count: 0, ts: 0 });
  const inputRef = useRef<TextInput>(null);
  const footerPulse = useRef(new Animated.Value(0)).current;

  const tipoSugestao = TERMINAL_CONFIG.tipoSugestao;
  const maxSugestoes = TERMINAL_CONFIG.maxSugestoes;

  const bg = theme.background;
  const containerG = theme.containerGradient;
  const priceG = theme.priceGradient;

  const allSugestoes = useMemo(() => {
    if (!sugestoes) return [];
    const map: Record<string, Sugestao[]> = {
      mesma_marca: sugestoes.mesma_marca,
      complementares: sugestoes.complementares,
      perfil: sugestoes.perfil,
      todas: [...sugestoes.complementares, ...sugestoes.mesma_marca, ...sugestoes.perfil],
    };
    return (map[tipoSugestao] || map.todas).slice(0, maxSugestoes);
  }, [maxSugestoes, sugestoes, tipoSugestao]);

  const clearConsult = useCallback(() => {
    setProduto(null);
    setSugestoes(null);
    setEan("");
    setLoading(false);
    inputRef.current?.focus();
  }, []);

  const consult = useCallback(
    async (code?: string) => {
      const search = String(code ?? ean).replace(/\D/g, "").trim();
      if (!search) return;

      setLoading(true);
      setProduto(null);
      setSugestoes(null);

      try {
        const prodRes = await fetch(`${FUNCTIONS_BASE_URL}/api-produtos?ean=${search}`);
        if (!prodRes.ok) {
          setLoading(false);
          return;
        }
        const prodData = (await prodRes.json()) as { produto?: Produto };
        if (!prodData.produto) {
          setLoading(false);
          return;
        }

        setProduto(prodData.produto);
        setEan("");
        setLoading(false);

        if (prodData.produto.imagem_url_vtex) {
          const t = await extractThemeFromImage(prodData.produto.imagem_url_vtex);
          if (t) setTheme(t);
        } else {
          setTheme(FALLBACK_THEME);
        }

        if (TERMINAL_CONFIG.enableTts && prodData.produto.preco) {
          const params = new URLSearchParams({
            preco: String(prodData.produto.preco),
            ...(prodData.produto.preco_lista && prodData.produto.preco_lista > (prodData.produto.preco ?? 0)
              ? { preco_lista: String(prodData.produto.preco_lista) }
              : {}),
            tipo_sugestao: tipoSugestao,
          });

          const ttsRes = await fetch(`${FUNCTIONS_BASE_URL}/tts-audio?${params.toString()}`);
          if (ttsRes.ok) {
            const tts = (await ttsRes.json()) as { audio_url?: string };
            if (tts.audio_url) void playRemoteAudio(tts.audio_url);
          }
        }

        fetch(`${FUNCTIONS_BASE_URL}/api-sugestoes?ean=${search}&limit=${maxSugestoes}`)
          .then((r) => r.json())
          .then((d: { sugestoes?: Sugestoes }) => {
            if (d.sugestoes) setSugestoes(d.sugestoes);
          })
          .catch(() => undefined);
      } catch {
        setLoading(false);
      }
    },
    [ean, maxSugestoes, tipoSugestao],
  );

  useEffect(() => {
    if (!produto) return;
    const t = setTimeout(() => clearConsult(), 8000);
    return () => clearTimeout(t);
  }, [produto, clearConsult]);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(footerPulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(footerPulse, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [footerPulse]);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    StatusBar.setHidden(true, "none");

    try {
      disallowScreenshot(true);
      keepAwake(true);
    } catch {
      return;
    }

    void setScreenSecure(true);
    void setImmersive(true);
    void SystemNavigationBar.stickyImmersive();
    const interval = setInterval(() => {
      void SystemNavigationBar.stickyImmersive();
    }, 800);

    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    void isDeviceOwnerApp()
      .then((isOwner) => {
        if (!isOwner) return false;
        return applyDeviceOwnerPolicies();
      })
      .then(() => enterKioskMode())
      .catch(() => enterKioskMode().catch(() => undefined));

    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, []);

  const onFooterTap = useCallback(() => {
    const now = Date.now();
    const state = footerTapRef.current;
    if (now - state.ts > ADMIN.tapWindowMs) {
      state.count = 0;
      state.ts = now;
    }
    state.count += 1;
    state.ts = now;
    if (state.count >= ADMIN.tapTargetCount) {
      state.count = 0;
      setAdminPin("");
      setAdminOpen(true);
    }
  }, []);

  const adminDigit = (d: string) => setAdminPin((p) => (p + d).slice(0, 8));
  const adminBackspace = () => setAdminPin((p) => p.slice(0, -1));

  const onAdminEnter = useCallback(async () => {
    if (adminPin !== ADMIN.pin) return;
    const active = await isKioskModeActive().catch(() => false);
    if (active) {
      await exitKioskMode().catch(() => undefined);
      await clearDeviceOwnerPolicies().catch(() => undefined);
    }
    setAdminOpen(false);
  }, [adminPin]);

  const activateKiosk = useCallback(async () => {
    const isOwner = await isDeviceOwnerApp().catch(() => false);
    if (isOwner) await applyDeviceOwnerPolicies().catch(() => undefined);
    await enterKioskMode().catch(() => undefined);
    setAdminOpen(false);
  }, []);

  const imagePanelWidth = isLandscape ? Math.round(vw * 0.4) : vw - padding * 2;
  const imageMaxHeight = isLandscape ? Math.round(vh * 0.76) : Math.round(vh * 0.38);
  const containerRadius = Math.round(clamp(18, minDim * 0.03, 34));

  const suggestionCols = isLandscape ? 3 : vw < 520 ? 2 : 3;
  const suggestionTitle =
    tipoSugestao === "mesma_marca"
      ? "Veja os produtos da mesma marca"
      : tipoSugestao === "perfil"
        ? "Recomendados pra você"
        : "Uma ótima combinação pra você";

  const name = produto ? normalizeProductName(produto.nome) : "";
  const split = splitHighlight(name, 3);

  const titleSize = clamp(35, Math.round(minDim * 0.052), 60);
  const restSize = clamp(18, Math.round(titleSize * 0.58), 34);
  const brandSize = clamp(12, Math.round(minDim * 0.018), 18);

  const preco = produto?.preco ?? 0;
  const hasDiscount = !!(produto?.preco_lista && produto?.preco && produto.preco_lista > produto.preco);
  const priceReaisSize = clamp(70, Math.round(minDim * 0.14), 150);
  const centsSize = Math.round(priceReaisSize * 0.42);

  return (
    <View style={styles.root}>
      <SystemBars hidden={{ statusBar: true, navigationBar: true }} style={{ statusBar: "light", navigationBar: "light" }} />
      <StatusBar hidden />

      <LinearGradient colors={bg} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />

      <TextInput
        ref={inputRef}
        value={ean}
        onChangeText={(t) => setEan(t.replace(/\D/g, ""))}
        onSubmitEditing={() => void consult()}
        showSoftInputOnFocus={false}
        style={styles.hiddenInput}
        autoFocus
        importantForAutofill="no"
        autoCorrect={false}
        caretHidden
      />

      <View style={[styles.stage, { paddingTop: padding + insets.top, paddingBottom: footerSpace + padding + insets.bottom, paddingHorizontal: padding }]}>
        {loading && <View style={styles.loadingDot} />}

        {produto && (
          <View style={[styles.consultContainer, isLandscape ? { flexDirection: "row" } : { flexDirection: "column" }]}>
            <View style={{ flex: 1, minWidth: 0, justifyContent: "center", marginRight: isLandscape ? gap : 0, marginBottom: isLandscape ? 0 : gap }}>
              <LinearGradient
                colors={containerG}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={[
                  styles.infoCard,
                  {
                    borderRadius: containerRadius,
                    padding: Math.max(16, Math.round(gap * 1.05)),
                  },
                ]}
              >
                <View
                  style={[
                    styles.descCard,
                    { borderRadius: Math.max(14, Math.round(containerRadius * 0.75)), padding: Math.max(14, Math.round(gap * 0.95)) },
                    { alignItems: isLandscape ? "flex-start" : "center" },
                  ]}
                >
                  <Text style={[styles.title, { fontSize: titleSize, color: theme.textColor }]}>{split.highlight}</Text>
                  {split.rest ? <Text style={[styles.rest, { fontSize: restSize, color: theme.textColor }]}>{split.rest}</Text> : null}
                  {produto.marca ? <Text style={[styles.brand, { fontSize: brandSize }]}>{produto.marca}</Text> : null}
                </View>

                <LinearGradient
                  colors={priceG}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.priceCard,
                    {
                      marginTop: Math.max(14, Math.round(gap * 0.9)),
                      borderRadius: Math.max(16, Math.round(containerRadius * 0.9)),
                      paddingVertical: Math.max(14, Math.round(gap * 0.8)),
                      paddingHorizontal: Math.max(18, Math.round(gap * 1.2)),
                    },
                  ]}
                >
                  {hasDiscount && produto.preco_lista ? (
                    <Text style={[styles.oldPrice, { color: "rgba(255,255,255,0.75)" }]}>De R$ {produto.preco_lista.toFixed(2)}</Text>
                  ) : null}

                  <View style={styles.priceRow}>
                    <Text style={[styles.currency, { fontSize: Math.round(priceReaisSize * 0.26), marginTop: Math.round(priceReaisSize * 0.12) }]}>
                      R$
                    </Text>
                    <Text style={[styles.reais, { fontSize: priceReaisSize }]}>{formatPrice(preco).reais}</Text>
                    <Text style={[styles.cents, { fontSize: centsSize }]}>,{formatPrice(preco).centavos}</Text>
                  </View>

                  {produto.unidade_medida ? <Text style={[styles.unit, { color: "rgba(255,255,255,0.75)" }]}>{produto.unidade_medida}</Text> : null}
                </LinearGradient>

                {allSugestoes.length > 0 && (
                  <View style={{ marginTop: gap }}>
                    <View style={[styles.suggestionTitleWrap, { borderColor: "rgba(0,0,0,0.08)" }]}>
                      <Text style={[styles.suggestionTitleText, { color: theme.textColor }]}>{suggestionTitle}</Text>
                    </View>

                    <View style={styles.suggestionGrid}>
                      {allSugestoes.map((s) => (
                        <Pressable
                          key={s.ean}
                          onPress={() => void consult(s.ean)}
                          style={[
                            styles.suggestionCard,
                            {
                              width: `${100 / suggestionCols}%`,
                              padding: 12,
                              marginBottom: Math.max(10, Math.round(gap * 0.8)),
                            },
                          ]}
                        >
                          {s.imagem_url_vtex ? (
                            <Image source={{ uri: s.imagem_url_vtex }} style={styles.suggestionImg} resizeMode="contain" />
                          ) : (
                            <View style={styles.suggestionNoImg} />
                          )}
                          <Text style={[styles.suggestionName, { color: theme.textColor }]} numberOfLines={2}>
                            {normalizeProductName(s.nome)}
                          </Text>
                          {s.preco ? (
                            <LinearGradient colors={priceG} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.suggestionPricePill}>
                              <Text style={styles.suggestionPriceText}>R$ {s.preco.toFixed(2)}</Text>
                            </LinearGradient>
                          ) : null}
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}
              </LinearGradient>
            </View>

            <View
              style={{
                width: imagePanelWidth,
                marginRight: isLandscape ? -30 : 0,
                backgroundColor: "#fff",
                borderRadius: containerRadius,
                padding: Math.max(14, Math.round(gap)),
                justifyContent: "center",
                alignItems: "center",
                minHeight: isLandscape ? Math.round(vh - footerSpace - padding * 2) : Math.round(vh * 0.34),
                shadowColor: "#000",
                shadowOpacity: 0.14,
                shadowRadius: 22,
                shadowOffset: { width: 0, height: 12 },
                elevation: 12,
              }}
            >
              {produto.imagem_url_vtex ? (
                <Image
                  source={{ uri: produto.imagem_url_vtex }}
                  style={{ width: "100%", height: imageMaxHeight }}
                  resizeMode="contain"
                />
              ) : (
                <View style={{ width: "100%", height: imageMaxHeight }} />
              )}
            </View>
          </View>
        )}
      </View>

      <Pressable onPress={onFooterTap} style={styles.footer}>
        <Animated.View
          style={{
            transform: [
              {
                scale: footerPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.03],
                }),
              },
            ],
            opacity: footerPulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.78, 1],
            }),
          }}
        >
          <Text style={styles.footerText}>Consulte o preço aqui</Text>
        </Animated.View>
      </Pressable>

      <Modal visible={adminOpen} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Admin</Text>
            <Text style={styles.modalSub}>Dispositivo: {DeviceInfo.getModel()} • {DeviceInfo.getSystemVersion()}</Text>

            <View style={styles.pinBox}>
              <Text style={styles.pinText}>{adminPin.replace(/./g, "•") || "—"}</Text>
            </View>

            <View style={styles.keypad}>
              {["1","2","3","4","5","6","7","8","9","0"].map((d) => (
                <Pressable key={d} onPress={() => adminDigit(d)} style={styles.key}>
                  <Text style={styles.keyText}>{d}</Text>
                </Pressable>
              ))}
              <Pressable onPress={adminBackspace} style={[styles.key, styles.keyAlt]}>
                <Text style={styles.keyText}>⌫</Text>
              </Pressable>
              <Pressable onPress={() => void onAdminEnter()} style={[styles.key, styles.keyOk]}>
                <Text style={styles.keyText}>OK</Text>
              </Pressable>
            </View>

            <View style={styles.modalRow}>
              <Pressable onPress={() => setAdminOpen(false)} style={[styles.modalBtn, styles.modalBtnGhost, { marginRight: 10 }]}>
                <Text style={styles.modalBtnTextGhost}>Fechar</Text>
              </Pressable>
              <Pressable
                onPress={() => void exitKioskMode().catch(() => undefined)}
                style={[styles.modalBtn, styles.modalBtnDanger]}
              >
                <Text style={styles.modalBtnText}>Sair do Kiosk</Text>
              </Pressable>
            </View>

            <Pressable onPress={() => void activateKiosk()} style={[styles.modalBtn, { marginTop: 10, backgroundColor: "#2ecc71" }]}>
              <Text style={styles.modalBtnText}>Ativar Kiosk</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  hiddenInput: { position: "absolute", width: 1, height: 1, opacity: 0 },
  stage: { flex: 1, width: "100%" },
  loadingDot: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 10,
    height: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  consultContainer: { flex: 1, width: "100%", alignItems: "center" },
  infoCard: {
    width: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  descCard: {
    backgroundColor: "rgba(255,255,255,0.78)",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  title: { fontWeight: "900", letterSpacing: -0.6, textAlign: "center" },
  rest: { fontWeight: "400", opacity: 0.92, marginTop: 4, textAlign: "center" },
  brand: { marginTop: 8, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase", opacity: 0.55 },
  priceCard: { alignItems: "center" },
  oldPrice: { fontWeight: "700", marginBottom: 6 },
  priceRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center" },
  currency: { color: "#fff", fontWeight: "900", marginRight: 6 },
  reais: { color: "#fff", fontWeight: "900", letterSpacing: -1 },
  cents: { color: "#fff", fontWeight: "900", marginLeft: 2, marginBottom: 6 },
  unit: { marginTop: 6, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  suggestionTitleWrap: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  suggestionTitleText: { fontWeight: "900", textAlign: "center", textTransform: "uppercase", letterSpacing: 1 },
  suggestionGrid: { flexDirection: "row", flexWrap: "wrap" },
  suggestionCard: {
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.80)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
  },
  suggestionImg: { width: 84, height: 84, marginBottom: 10 },
  suggestionNoImg: { width: 84, height: 84, marginBottom: 10, backgroundColor: "rgba(0,0,0,0.04)", borderRadius: 14 },
  suggestionName: { fontWeight: "700", fontSize: 12, textAlign: "center" },
  suggestionPricePill: { marginTop: 10, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  suggestionPriceText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.78)",
    alignItems: "center",
  },
  footerText: { fontSize: 20, fontWeight: "900", letterSpacing: 0.3, opacity: 0.95 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 18 },
  modalCard: { width: "100%", maxWidth: 520, backgroundColor: "#111", borderRadius: 18, padding: 16 },
  modalTitle: { color: "#fff", fontSize: 20, fontWeight: "900" },
  modalSub: { color: "rgba(255,255,255,0.6)", marginTop: 6, marginBottom: 14 },
  pinBox: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  pinText: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: 6 },
  keypad: { flexDirection: "row", flexWrap: "wrap", marginTop: 14, justifyContent: "space-between" },
  key: {
    width: "30%",
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    marginBottom: 10,
  },
  keyAlt: { backgroundColor: "rgba(255,255,255,0.12)" },
  keyOk: { backgroundColor: "#2ecc71" },
  keyText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  modalRow: { flexDirection: "row", marginTop: 14 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: "center" },
  modalBtnGhost: { backgroundColor: "rgba(255,255,255,0.08)" },
  modalBtnDanger: { backgroundColor: "#e53935" },
  modalBtnText: { color: "#fff", fontWeight: "900" },
  modalBtnTextGhost: { color: "#fff", fontWeight: "800" },
});
