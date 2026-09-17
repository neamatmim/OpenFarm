// PROTOTYPE — throwaway. Floating variant switcher shared by /prototype/* routes.
// Hidden in production builds so a stray merge can never ship it.
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";

interface Props {
  variants: readonly { key: string; name: string }[];
  current: string;
}

export const PrototypeSwitcher = ({ variants, current }: Props) => {
  const navigate = useNavigate();
  const idx = Math.max(
    0,
    variants.findIndex((v) => v.key === current)
  );

  const go = (delta: number) => {
    const next = variants[(idx + delta + variants.length) % variants.length];
    if (!next) {
      return;
    }
    navigate({
      to: ".",
      // PROTOTYPE — the routes share one search union; this switcher only ever adds `variant`.
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        variant: next.key,
      })) as never,
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        go(-1);
      }
      if (e.key === "ArrowRight") {
        go(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) {
    return null;
  }

  return (
    <div className="fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border-2 border-yellow-400 bg-black/90 px-3 py-1.5 font-mono text-xs text-yellow-300 shadow-xl">
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="previous variant"
        className="p-1"
      >
        <ChevronLeft size={16} />
      </button>
      <span>
        PROTOTYPE {variants[idx]?.key} — {variants[idx]?.name}
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="next variant"
        className="p-1"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
};
