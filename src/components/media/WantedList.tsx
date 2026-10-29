import { useState } from "react";
import { Search } from "lucide-react";
import { ConfirmDialog } from "@/components/Dialog";
import { ErrorPanel } from "@/components/ErrorPanel";
import { Empty, Loading, Segmented } from "@/components/ui";
import { SearchChoice } from "./SearchChoice";
import { Poster } from "./PosterCard";
import type { ArrService, WantedKind } from "@/api/arr";
import { t } from "@/i18n/es";

export interface WantedRow {
  key: number;
  title: string;
  subtitle?: string;
  poster?: string;
  onAuto: () => void;
  onManual: () => void;
  onOpen?: () => void;
}

const STEP = 100;

/** Pestaña "Buscadas": lo que falta o lo que puede mejorar de calidad, con búsqueda de todo de una vez. */
export function WantedList({
  service,
  kind,
  onKind,
  rows,
  isLoading,
  error,
  onRetry,
  onSearchAll,
  searchAllLabel,
}: {
  service: ArrService;
  kind: WantedKind;
  onKind: (k: WantedKind) => void;
  rows: WantedRow[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  onSearchAll: () => void;
  searchAllLabel: string;
}) {
  const [shown, setShown] = useState(STEP);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<WantedKind>
          value={kind}
          onChange={(k) => {
            setShown(STEP);
            onKind(k);
          }}
          options={[
            { value: "missing", label: t.wanted.missing },
            { value: "cutoff", label: t.wanted.cutoff },
          ]}
        />
        <span className="text-sm text-muted">
          {kind === "missing" ? t.wanted.missingHint : t.wanted.cutoffHint}
          {!isLoading && !error && ` · ${t.wanted.count(rows.length)}`}
        </span>
        <button className="btn-primary ml-auto" disabled={!rows.length} onClick={() => setConfirm(true)}>
          <Search className="h-4 w-4" /> {searchAllLabel}
        </button>
      </div>
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorPanel service={service} error={error} onRetry={onRetry} />
      ) : !rows.length ? (
        <Empty>{kind === "missing" ? t.wanted.emptyMissing : t.wanted.emptyCutoff}</Empty>
      ) : (
        <div className="card divide-y divide-border">
          {rows.slice(0, shown).map((r) => (
            <div key={r.key} className="flex items-center gap-3 px-4 py-2">
              <Poster src={r.poster} title={r.title} className="w-8 shrink-0 rounded" />
              <button className="min-w-0 flex-1 text-left" onClick={r.onOpen} disabled={!r.onOpen}>
                <div className="truncate text-sm font-medium">{r.title}</div>
                {r.subtitle && <div className="truncate text-xs text-muted">{r.subtitle}</div>}
              </button>
              <SearchChoice what={r.title} onAuto={r.onAuto} onManual={r.onManual} />
            </div>
          ))}
          {rows.length > shown && (
            <button className="w-full px-4 py-2 text-sm text-accent hover:bg-surface-2" onClick={() => setShown((n) => n + STEP)}>
              {t.wanted.showMore(Math.min(STEP, rows.length - shown))}
            </button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={searchAllLabel}
        message={t.wanted.searchAllConfirm(rows.length)}
        confirmLabel={searchAllLabel}
        onConfirm={onSearchAll}
        danger={false}
      />
    </div>
  );
}
