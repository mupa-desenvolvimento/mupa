/** Props para inputs que não devem abrir o teclado nativo (Android/iOS no browser). */
export const suppressNativeKeyboardProps = {
  inputMode: "none" as const,
  autoComplete: "off" as const,
  autoCorrect: "off" as const,
  spellCheck: false as const,
};
