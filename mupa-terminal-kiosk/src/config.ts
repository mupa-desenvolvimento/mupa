export const SUPABASE_URL = "https://vsocztidewsdlzcongkz.supabase.co";
export const SUPABASE_ANON_KEY = "REPLACE_ME";

export const FUNCTIONS_BASE_URL = `${SUPABASE_URL}/functions/v1`;

export const TERMINAL_CONFIG = {
  maxSugestoes: 6,
  tipoSugestao: "complementares" as "complementares" | "mesma_marca" | "perfil" | "todas",
  enableBeep: true,
  enableTts: true,
};

export const ADMIN = {
  pin: "2580",
  tapTargetCount: 7,
  tapWindowMs: 1800,
};
