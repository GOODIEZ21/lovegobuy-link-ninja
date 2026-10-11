import { useEffect, useState } from "react";

const EMOJIS = ["🔍", "📦", "📸", "✨"];

/** Animowany loader QC z emoji i odliczaniem (3–5 s). */
export function QcLoading({ seconds = 4, label = "Szukam zdjęć QC" }: { seconds?: number; label?: string }) {
  const [left, setLeft] = useState(seconds);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const a = setInterval(() => setLeft((v) => (v > 1 ? v - 1 : 1)), 1000);
    const b = setInterval(() => setFrame((f) => (f + 1) % EMOJIS.length), 400);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface-deep p-6 text-center">
      <span className="text-3xl" aria-hidden>
        {EMOJIS[frame]}
      </span>
      <p className="text-sm font-semibold">{label}…</p>
      <p className="text-xs text-muted-foreground">~{left} s</p>
    </div>
  );
}
