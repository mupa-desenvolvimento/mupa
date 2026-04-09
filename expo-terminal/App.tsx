import { StatusBar } from "expo-status-bar";
import * as Application from "expo-application";
import * as NavigationBar from "expo-navigation-bar";
import { useKeepAwake } from "expo-keep-awake";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WebView } from "react-native-webview";
import type { WebViewNavigation } from "react-native-webview";

export default function App() {
  useKeepAwake();

  const webviewRef = useRef<WebView>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [webError, setWebError] = useState<string>("");
  const [webKey, setWebKey] = useState(0);
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const focusTimerRef = useRef<number | null>(null);

  const [baseUrl, setBaseUrl] = useState<string>("http://192.168.1.14:8080");
  const [deviceId, setDeviceId] = useState<string>("");

  const [baseUrlDraft, setBaseUrlDraft] = useState<string>("");
  const [deviceIdDraft, setDeviceIdDraft] = useState<string>("");

  const terminalUrl = useMemo(() => {
    const base = String(baseUrl || "").trim().replace(/\/+$/, "");
    const id = String(deviceId || "").trim();
    if (!base) return "";
    if (!id) return `${base}/terminal`;
    return `${base}/terminal?device_id=${encodeURIComponent(id)}`;
  }, [baseUrl, deviceId]);

  const getStableDeviceId = useCallback(async () => {
    const existing = await AsyncStorage.getItem("mupa.deviceId");
    if (existing) return existing;

    const androidId = Platform.OS === "android" ? Application.getAndroidId() : null;
    const iosId = Platform.OS === "ios" ? await Application.getIosIdForVendorAsync().catch(() => null) : null;
    const fromPlatform = String(androidId || iosId || "").trim();
    const generated = fromPlatform || `mupa_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
    await AsyncStorage.setItem("mupa.deviceId", generated);
    return generated;
  }, []);

  useEffect(() => {
    void (async () => {
      const [storedBaseUrl, storedDeviceId] = await Promise.all([
        AsyncStorage.getItem("mupa.baseUrl"),
        AsyncStorage.getItem("mupa.deviceId"),
      ]);

      const nextBase = String(storedBaseUrl || baseUrl).trim();
      setBaseUrl(nextBase);

      const nextId = String(storedDeviceId || "").trim() || await getStableDeviceId();
      setDeviceId(nextId);
    })();
  }, [getStableDeviceId]);

  useEffect(() => {
    setBaseUrlDraft(baseUrl);
    setDeviceIdDraft(deviceId);
  }, [baseUrl, deviceId, settingsOpen]);

  const applySettings = useCallback(async () => {
    const nextBase = String(baseUrlDraft || "").trim().replace(/\/+$/, "");
    const nextId = String(deviceIdDraft || "").trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);

    if (!nextBase) {
      Alert.alert("Configuração", "Informe a URL base do terminal (ex: http://192.168.1.14:8080).");
      return;
    }

    await Promise.all([
      AsyncStorage.setItem("mupa.baseUrl", nextBase),
      AsyncStorage.setItem("mupa.deviceId", nextId || ""),
    ]);

    setBaseUrl(nextBase);
    setDeviceId(nextId);
    setWebError("");
    setWebKey((k) => k + 1);
    setSettingsOpen(false);
  }, [baseUrlDraft, deviceIdDraft]);

  const clearWebCache = useCallback(() => {
    setWebError("");
    setWebKey((k) => k + 1);
  }, []);

  const injectFocusScanInput = useCallback(() => {
    webviewRef.current?.injectJavaScript(`
      (function () {
        try {
          var el = document.querySelector('input[aria-hidden="true"]') || document.querySelector('input[type="text"]');
          if (el) {
            el.setAttribute('inputmode','none');
            el.setAttribute('autocomplete','off');
            el.setAttribute('autocorrect','off');
            el.setAttribute('spellcheck','false');
            el.focus();
          }
        } catch (e) {}
        true;
      })();
    `);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    void (async () => {
      try {
        await NavigationBar.setVisibilityAsync("hidden");
        await NavigationBar.setBehaviorAsync("inset-swipe");
        await NavigationBar.setPositionAsync("absolute");
        await NavigationBar.setBackgroundColorAsync("#00000000");
      } catch {
        return;
      }
    })();
  }, []);

  useEffect(() => {
    if (focusTimerRef.current) window.clearInterval(focusTimerRef.current);
    focusTimerRef.current = window.setInterval(() => {
      if (!settingsOpen && !webError) injectFocusScanInput();
    }, 1400);
    return () => {
      if (focusTimerRef.current) window.clearInterval(focusTimerRef.current);
      focusTimerRef.current = null;
    };
  }, [injectFocusScanInput, settingsOpen, webError]);

  const reload = useCallback(() => {
    setWebError("");
    webviewRef.current?.reload();
  }, []);

  const sendKeyToWeb = useCallback((key: string) => {
    const safe = JSON.stringify(String(key));
    webviewRef.current?.injectJavaScript(`
      (function () {
        try {
          var el = document.querySelector('input[aria-hidden="true"]') || document.querySelector('input[type="text"]');
          if (el) el.focus();
          var k = ${safe};
          var ev = new KeyboardEvent('keydown', { key: k, bubbles: true });
          document.dispatchEvent(ev);
          if (el) el.dispatchEvent(ev);
        } catch (e) {}
        true;
      })();
    `);
  }, []);

  const sendEnterToWeb = useCallback(() => sendKeyToWeb("Enter"), [sendKeyToWeb]);
  const sendBackspaceToWeb = useCallback(() => sendKeyToWeb("Backspace"), [sendKeyToWeb]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar hidden />

      <View style={styles.header}>
        <Text style={styles.title}>Mupa Terminal</Text>
        <View style={styles.headerRight}>
          <Pressable style={styles.headerBtn} onPress={reload}>
            <Text style={styles.headerBtnText}>Recarregar</Text>
          </Pressable>
          <Pressable style={styles.headerBtnSecondary} onPress={clearWebCache}>
            <Text style={styles.headerBtnText}>Limpar cache</Text>
          </Pressable>
          <Pressable style={styles.headerBtnSecondary} onPress={() => setSettingsOpen(true)}>
            <Text style={styles.headerBtnText}>Config</Text>
          </Pressable>
        </View>
      </View>

      {webError ? (
        <View style={styles.errorScreen}>
          <Text style={styles.errorTitle}>Falha ao abrir o terminal</Text>
          <Text style={styles.errorText}>{webError}</Text>
          <Text style={styles.errorTextSmall}>{terminalUrl || "URL não configurada"}</Text>
          <View style={styles.errorActions}>
            <Pressable style={styles.errorBtn} onPress={reload}>
              <Text style={styles.errorBtnText}>Tentar novamente</Text>
            </Pressable>
            <Pressable style={styles.errorBtnSecondary} onPress={() => setSettingsOpen(true)}>
              <Text style={styles.errorBtnText}>Configurar</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.webContainer}>
          {!terminalUrl ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Configuração necessária</Text>
              <Text style={styles.emptyText}>Defina a URL base do terminal.</Text>
              <Pressable style={styles.emptyBtn} onPress={() => setSettingsOpen(true)}>
                <Text style={styles.emptyBtnText}>Abrir configurações</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <WebView
                key={webKey}
                ref={webviewRef}
                source={{ uri: terminalUrl }}
                onLoadStart={() => setLoading(true)}
                onLoadEnd={() => {
                  setLoading(false);
                  injectFocusScanInput();
                }}
                onError={(e) => {
                  setLoading(false);
                  setWebError(e.nativeEvent.description || "Erro desconhecido ao carregar");
                }}
                onHttpError={(e) => {
                  setLoading(false);
                  setWebError(`HTTP ${e.nativeEvent.statusCode}`);
                }}
                onNavigationStateChange={(nav: WebViewNavigation) => setCurrentUrl(nav.url)}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled
                domStorageEnabled
                cacheEnabled
              />
              {loading ? (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" color="#ffffff" />
                  <Text style={styles.loadingText}>Carregando…</Text>
                </View>
              ) : null}
            </>
          )}
        </View>
      )}

      <View style={styles.keypad}>
        <View style={styles.keypadRow}>
          {["1", "2", "3"].map((k) => (
            <Pressable key={k} style={styles.keypadKey} onPress={() => sendKeyToWeb(k)}>
              <Text style={styles.keypadKeyText}>{k}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.keypadRow}>
          {["4", "5", "6"].map((k) => (
            <Pressable key={k} style={styles.keypadKey} onPress={() => sendKeyToWeb(k)}>
              <Text style={styles.keypadKeyText}>{k}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.keypadRow}>
          {["7", "8", "9"].map((k) => (
            <Pressable key={k} style={styles.keypadKey} onPress={() => sendKeyToWeb(k)}>
              <Text style={styles.keypadKeyText}>{k}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.keypadRow}>
          <Pressable style={styles.keypadKeySecondary} onPress={sendBackspaceToWeb}>
            <Text style={styles.keypadKeyText}>⌫</Text>
          </Pressable>
          <Pressable style={styles.keypadKey} onPress={() => sendKeyToWeb("0")}>
            <Text style={styles.keypadKeyText}>0</Text>
          </Pressable>
          <Pressable style={styles.keypadKeyPrimary} onPress={sendEnterToWeb}>
            <Text style={styles.keypadKeyText}>↵</Text>
          </Pressable>
        </View>
      </View>

      <Modal animationType="slide" visible={settingsOpen} onRequestClose={() => setSettingsOpen(false)}>
        <SafeAreaView style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Configurações</Text>
            <Pressable style={styles.modalClose} onPress={() => setSettingsOpen(false)}>
              <Text style={styles.modalCloseText}>Fechar</Text>
            </Pressable>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>URL base do Terminal</Text>
            <TextInput
              value={baseUrlDraft}
              onChangeText={setBaseUrlDraft}
              placeholder="http://192.168.1.14:8080"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.input}
            />

            <Text style={styles.label}>device_id (opcional)</Text>
            <TextInput
              value={deviceIdDraft}
              onChangeText={setDeviceIdDraft}
              placeholder="0a2e876170a058a7"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />

            <Text style={styles.help}>
              O app abre {`/terminal?device_id=`}… para permitir reconhecimento do dispositivo no wizard.
            </Text>

            <Pressable style={styles.primary} onPress={() => void applySettings()}>
              <Text style={styles.primaryText}>Salvar e abrir</Text>
            </Pressable>

            <View style={styles.kv}>
              <Text style={styles.kvKey}>URL atual</Text>
              <Text style={styles.kvValue}>{terminalUrl || "—"}</Text>
            </View>
            <View style={styles.kv}>
              <Text style={styles.kvKey}>Tela atual</Text>
              <Text style={styles.kvValue}>{currentUrl || "—"}</Text>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b1220" },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.10)",
    backgroundColor: "#0b1220",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  headerRight: { flexDirection: "row", gap: 8, alignItems: "center" },
  headerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#2563eb",
    borderRadius: 10,
  },
  headerBtnSecondary: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 10,
  },
  headerBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  webContainer: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22, gap: 10 },
  emptyTitle: { color: "#fff", fontSize: 20, fontWeight: "900" },
  emptyText: { color: "rgba(255,255,255,0.85)", fontSize: 14, textAlign: "center" },
  emptyBtn: { backgroundColor: "#2563eb", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  emptyBtnText: { color: "#fff", fontWeight: "800" },
  errorScreen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22, gap: 12 },
  errorTitle: { color: "#fff", fontSize: 22, fontWeight: "900", textAlign: "center" },
  errorText: { color: "rgba(255,255,255,0.92)", fontSize: 15, textAlign: "center" },
  errorTextSmall: { color: "rgba(255,255,255,0.7)", fontSize: 12, textAlign: "center" },
  errorActions: { flexDirection: "row", gap: 10, marginTop: 8, flexWrap: "wrap", justifyContent: "center" },
  errorBtn: { backgroundColor: "#2563eb", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  errorBtnSecondary: { backgroundColor: "rgba(255,255,255,0.10)", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  errorBtnText: { color: "#fff", fontWeight: "800" },

  modalRoot: { flex: 1, backgroundColor: "#0b1220" },
  modalHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.10)",
  },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  modalClose: { paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "rgba(255,255,255,0.10)", borderRadius: 10 },
  modalCloseText: { color: "#fff", fontWeight: "800" },
  form: { padding: 14, gap: 10 },
  label: { color: "rgba(255,255,255,0.88)", fontSize: 13, fontWeight: "800" },
  input: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
  },
  help: { color: "rgba(255,255,255,0.7)", fontSize: 12, lineHeight: 16 },
  primary: { backgroundColor: "#22c55e", paddingVertical: 12, borderRadius: 12, alignItems: "center", marginTop: 6 },
  primaryText: { color: "#052e16", fontWeight: "900", fontSize: 14 },
  kv: { marginTop: 10, gap: 4 },
  kvKey: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "800" },
  kvValue: { color: "#fff", fontSize: 12 },

  keypad: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: "#050a14",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
  },
  keypadRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  keypadKey: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  keypadKeyPrimary: {
    flex: 1,
    backgroundColor: "#22c55e",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  keypadKeySecondary: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  keypadKeyText: { color: "#fff", fontSize: 22, fontWeight: "900" },
});
