import { useEffect } from "react";
import { useLang } from "@/lib/i18n";
import { translateTexts } from "@/lib/translate.functions";

/** Tłumaczy CAŁĄ widoczną stronę (także teksty spoza słownika) na wybrany język. */
const original = new WeakMap<Node, string>();
const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "TEXTAREA", "INPUT", "SVG"]);
const hasLetters = (s: string) => /\p{L}{2,}/u.test(s) && !/^https?:\/\//.test(s.trim());

function cacheGet(lang: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(`pkmr_tr_${lang}`) || "{}");
  } catch {
    return {};
  }
}

export function AutoTranslate() {
  const { lang } = useLang();

  useEffect(() => {
    const nodes = (): Text[] => {
      const out: Text[] = [];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => {
          const p = n.parentElement;
          if (!p || p.closest("[data-no-translate],[translate=no]")) return NodeFilter.FILTER_REJECT;
          if (SKIP.has(p.tagName.toUpperCase())) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      while (w.nextNode()) out.push(w.currentNode as Text);
      return out;
    };

    if (lang === "pl") {
      for (const n of nodes()) {
        const o = original.get(n);
        if (o !== undefined && n.data !== o) n.data = o;
      }
      return;
    }

    const cache = cacheGet(lang);
    const pending = new Set<string>();
    let busy = false;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const applied = new WeakMap<Node, string>();

    const apply = () => {
      for (const n of nodes()) {
        if (applied.get(n) === n.data) continue;
        const src = n.data;
        original.set(n, src);
        applied.delete(n);
        const key = src.trim();
        if (!key || !hasLetters(key)) continue;
        const tr = cache[key];
        if (tr) {
          const v = src.replace(key, tr);
          applied.set(n, v);
          if (n.data !== v) n.data = v;
        } else pending.add(key);
      }
      void flush();
    };

    const flush = async () => {
      if (busy || !pending.size || stopped) return;
      busy = true;
      const batch = [...pending].slice(0, 60);
      batch.forEach((b) => pending.delete(b));
      try {
        const { out } = await translateTexts({ data: { lang, texts: batch } });
        batch.forEach((b, i) => (cache[b] = out[i] || b));
        localStorage.setItem(`pkmr_tr_${lang}`, JSON.stringify(cache));
      } catch {
        batch.forEach((b) => (cache[b] = b));
      }
      busy = false;
      if (!stopped) apply();
    };

    const obs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(apply, 250);
    });
    apply();
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      stopped = true;
      obs.disconnect();
      clearTimeout(timer);
      for (const n of nodes()) {
        const o = original.get(n);
        if (o !== undefined && applied.get(n) === n.data) n.data = o;
      }
    };
  }, [lang]);

  return null;
}
