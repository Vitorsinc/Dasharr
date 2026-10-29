import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Captions } from "lucide-react";
import { nyaaSubtitles } from "@/api/nyaa";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { hasSpanish, isNyaaPage, langLabel, mergeLanguages, titleSubtitles } from "@/lib/subtitles";
import { t } from "@/i18n/es";

/** true cuando el elemento entra en pantalla (y se queda así), para no pedir a Nyaa filas que nadie ve. */
function useSeen<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (seen || !ref.current) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setSeen(true);
    });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

/** Idiomas de subtítulos de una release: los del título al momento y, en Nyaa, los de la página del torrent. */
export function SubtitleBadge({ title, infoUrl }: { title: string; infoUrl?: string }) {
  const fromTitle = titleSubtitles(title);
  const nyaa = isNyaaPage(infoUrl);
  const [ref, seen] = useSeen<HTMLSpanElement>();
  const page = useQuery({
    queryKey: ["nyaa-subs", infoUrl],
    queryFn: () => nyaaSubtitles(infoUrl!),
    enabled: nyaa && seen,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: false,
  });
  const fromPage = page.data ?? [];
  const languages = mergeLanguages(fromPage, fromTitle.languages);
  const source = fromPage.length && fromTitle.languages.length ? t.releaseSubs.both : fromPage.length ? t.releaseSubs.fromNyaa : t.releaseSubs.fromTitle;

  let content;
  if (languages.length) {
    content = (
      <span
        className={cn("chip", hasSpanish(languages) ? "bg-success/10 text-success" : "bg-surface-2 text-muted")}
        title={source}
      >
        <Captions className="h-3 w-3" />
        {languages.map(langLabel).join(" · ")}
      </span>
    );
  } else if (nyaa && (page.isLoading || (!seen && !page.data))) {
    content = (
      <span className="chip text-muted" title={t.releaseSubs.reading}>
        <Captions className="h-3 w-3" />
        <Spinner className="h-3 w-3" />
      </span>
    );
  } else if (fromTitle.multi) {
    content = (
      <span className="chip bg-surface-2 text-muted" title={t.releaseSubs.multiHint}>
        <Captions className="h-3 w-3" />
        Multi-Subs
      </span>
    );
  } else if (nyaa) {
    content = (
      <span className="chip text-muted" title={page.isError ? String(page.error) : t.releaseSubs.unknownHint}>
        <Captions className="h-3 w-3" />
        {page.isError ? t.releaseSubs.error : t.releaseSubs.unknown}
      </span>
    );
  }
  return <span ref={ref}>{content}</span>;
}
