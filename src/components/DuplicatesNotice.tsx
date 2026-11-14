import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CopyMinus } from "lucide-react";
import { t } from "@/i18n/es";
import { planRemoval } from "@/api/qbit";
import { useDuplicates } from "@/hooks/useDuplicates";
import { formatBytes } from "@/lib/format";

/** Aviso en Inicio cuando hay torrents sobrantes. Mira el historial de los *arr como mucho cada media hora. */
export function DuplicatesNotice() {
  const dup = useDuplicates({ staleTime: 30 * 60_000 });
  const summary = useMemo(() => {
    const hashes = (dup.data?.groups ?? []).flatMap((g) => g.items.filter((i) => i.role === "leftover").map((i) => i.torrent.hash));
    return { count: hashes.length, freed: planRemoval(hashes, dup.data?.torrents ?? []).freed };
  }, [dup.data]);
  if (summary.count === 0) return null;
  return (
    <Link
      to="/duplicados"
      className="card flex items-center gap-3 border-warning/40 px-4 py-3 text-sm transition-colors hover:bg-surface-2"
    >
      <CopyMinus className="h-5 w-5 shrink-0 text-warning" aria-hidden />
      <span className="flex-1">{t.duplicates.homeNotice(summary.count, formatBytes(summary.freed))}</span>
      <span className="font-medium text-accent">{t.duplicates.homeReview}</span>
    </Link>
  );
}
