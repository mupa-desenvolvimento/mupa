import { cn } from "@/lib/utils";
import { Delete, CornerDownLeft } from "lucide-react";

export type VirtualKeyboardMode = "full" | "activation";

interface VirtualKeyboardProps {
  mode: VirtualKeyboardMode;
  onKey: (key: string) => void;
  onBackspace: () => void;
  onEnter?: () => void;
  /** Teclas escuras (ex.: terminal / kiosk em fundo escuro). */
  dark?: boolean;
  className?: string;
}

const FULL_ROWS: string[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

const ACTIVATION_ROWS: string[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];

const keyBtn = (dark: boolean) =>
  cn(
    "min-h-11 rounded-lg border px-1 text-sm font-medium shadow-sm active:scale-[0.97]",
    dark
      ? "border-white/20 bg-white/10 text-white"
      : "border-border/80 bg-background",
  );

export function VirtualKeyboard({
  mode,
  onKey,
  onBackspace,
  onEnter,
  dark = false,
  className,
}: VirtualKeyboardProps) {
  const rows = mode === "activation" ? ACTIVATION_ROWS : FULL_ROWS;
  const kb = keyBtn(dark);

  /** Fires the callback on pointerUp so it works even when the
   *  container uses preventDefault on pointerDown (to keep focus
   *  on the hidden input). */
  const tap = (fn: () => void) => ({
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation();
      fn();
    },
  });

  return (
    <div
      role="group"
      aria-label="Teclado virtual"
      className={cn(
        "select-none touch-manipulation border-t p-2 shadow-[0_-4px_24px_rgba(0,0,0,0.12)] backdrop-blur-sm",
        dark ? "border-white/10 bg-slate-950/95" : "border-border bg-muted/95",
        className,
      )}
      onPointerDown={(e) => e.preventDefault()}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
        {rows.map((row, ri) => (
          <div key={ri} className="flex justify-center gap-1">
            {row.map((k) => (
              <button
                key={k + ri}
                type="button"
                className={cn(kb, "min-w-[2.25rem] flex-1 max-w-[3rem] sm:min-w-10")}
                {...tap(() => onKey(k))}
              >
                {k}
              </button>
            ))}
          </div>
        ))}

        {mode === "full" && (
          <div className="flex justify-center gap-1">
            {["@", ".", "-", "_"].map((k) => (
              <button
                key={k}
                type="button"
                className={cn(kb, "min-w-10 px-2")}
                {...tap(() => onKey(k))}
              >
                {k}
              </button>
            ))}
            <button
              type="button"
              className={cn(kb, "min-w-0 flex-[2] max-w-[12rem] px-2")}
              {...tap(() => onKey(" "))}
            >
              espaço
            </button>
          </div>
        )}

        <div className="flex justify-center gap-2 pt-0.5">
          <button
            type="button"
            className={cn(
              kb,
              "flex min-w-24 items-center justify-center gap-2 px-4 sm:min-w-28",
            )}
            {...tap(onBackspace)}
          >
            <Delete className="h-4 w-4" />
            apagar
          </button>
          {onEnter && (
            <button
              type="button"
              className={cn(
                "flex min-h-11 min-w-24 flex-1 max-w-xs items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium shadow-sm active:scale-[0.97]",
                dark
                  ? "border-blue-500 bg-blue-600 text-white"
                  : "border-primary bg-primary text-primary-foreground",
              )}
              {...tap(onEnter)}
            >
              <CornerDownLeft className="h-4 w-4" />
              entrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
