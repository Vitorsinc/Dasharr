import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/Dialog";
import { Empty, Segmented, Spinner } from "@/components/ui";
import { t } from "@/i18n/es";
import { errorMessage } from "@/lib/errors";
import type { QualityProfile, RootFolder } from "@/api/arr";
import { formatBytes } from "@/lib/format";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Poster } from "./PosterCard";

export interface LookupItem {
  key: number;
  title: string;
  year?: number;
  overview?: string;
  poster?: string;
  exists: boolean;
  /** Etiqueta junto al título, p. ej. "Anime". */
  tag?: string;
}

export type AddSearchMode = "none" | "auto" | "manual";

export interface AddOptions {
  qualityProfileId: number;
  rootFolderPath: string;
  /** Búsqueda automática al añadir (la manual la abre la página después de añadir). */
  search: boolean;
  searchMode: AddSearchMode;
}

/** Diálogo genérico para buscar y añadir películas o series. */
export function AddMediaDialog<T>({
  open,
  onOpenChange,
  title,
  lookup,
  toItem,
  profiles,
  rootFolders,
  extra,
  preset,
  onPick,
  manualHint,
  onAdd,
  onQuickAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  lookup: (term: string) => Promise<T[]>;
  toItem: (r: T) => LookupItem;
  profiles: QualityProfile[];
  rootFolders: RootFolder[];
  extra?: ReactNode;
  /** Perfil y carpeta a preseleccionar; se aplican al elegir un resultado y cada vez que cambian. */
  preset?: Partial<Pick<AddOptions, "qualityProfileId" | "rootFolderPath">>;
  onPick?: (r: T) => void;
  /** Texto bajo el selector cuando se elige búsqueda manual. */
  manualHint: string;
  onAdd: (r: T, o: AddOptions) => Promise<void>;
  /** Añadido rápido desde la lista (sin cerrar el diálogo). Recibe el último perfil/carpeta usados y búsqueda automática. */
  onQuickAdd?: (r: T, o: AddOptions) => Promise<void>;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<T[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<T | null>(null);
  const [profileId, setProfileId] = useState<number | "">("");
  const [root, setRoot] = useState("");
  const [searchMode, setSearchMode] = useState<AddSearchMode>("auto");
  const [busy, setBusy] = useState(false);
  const [quickBusy, setQuickBusy] = useState<Set<number>>(new Set());
  const [quickDone, setQuickDone] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (profileId === "" && profiles[0]) setProfileId(profiles[0].id);
    if (!root && rootFolders[0]) setRoot(rootFolders[0].path);
  }, [profiles, rootFolders, profileId, root]);

  const presetProfile = preset?.qualityProfileId;
  const presetRoot = preset?.rootFolderPath;
  useEffect(() => {
    if (presetProfile != null) setProfileId(presetProfile);
    if (presetRoot) setRoot(presetRoot);
  }, [picked, presetProfile, presetRoot]);

  useEffect(() => {
    if (!open) {
      setPicked(null);
      setResults(null);
      setTerm("");
      setQuickBusy(new Set());
      setQuickDone(new Set());
      requestId.current++;
      lastQuery.current = "";
    }
  }, [open]);

  // Como en Radarr/Sonarr: busca solo mientras se escribe (con una pequeña pausa),
  // y descarta respuestas de búsquedas anteriores que lleguen tarde.
  const debouncedTerm = useDebouncedValue(term.trim(), 400);
  const lookupRef = useRef(lookup);
  lookupRef.current = lookup;
  const requestId = useRef(0);
  const lastQuery = useRef("");

  async function runLookup(q: string) {
    const id = ++requestId.current;
    lastQuery.current = q;
    if (q.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const r = await lookupRef.current(q);
      if (id === requestId.current) setResults(r);
    } catch (err) {
      if (id === requestId.current) toast.error(errorMessage(err));
    } finally {
      if (id === requestId.current) setSearching(false);
    }
  }

  useEffect(() => {
    if (open && debouncedTerm !== lastQuery.current) void runLookup(debouncedTerm);
  }, [debouncedTerm, open]);

  function doLookup(e?: React.FormEvent) {
    e?.preventDefault();
    setPicked(null);
    void runLookup(term.trim());
  }

  async function add() {
    if (!picked || profileId === "" || !root) return;
    setBusy(true);
    try {
      await onAdd(picked, { qualityProfileId: profileId, rootFolderPath: root, search: searchMode === "auto", searchMode });
      toast.success(t.library.added(toItem(picked).title));
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function quickAdd(r: T) {
    const key = toItem(r).key;
    if (!onQuickAdd || profileId === "" || !root || quickBusy.has(key)) return;
    setQuickBusy((s) => new Set(s).add(key));
    try {
      await onQuickAdd(r, { qualityProfileId: profileId, rootFolderPath: root, search: true, searchMode: "auto" });
      setQuickDone((s) => new Set(s).add(key));
      toast.success(t.library.added(toItem(r).title));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setQuickBusy((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  }

  const p = picked ? toItem(picked) : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} wide>
      {!p ? (
        <div className="flex flex-col gap-4">
          <form onSubmit={doLookup} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                autoFocus
                className="input pl-9"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder={t.library.lookupPlaceholder}
                aria-label={t.library.lookupPlaceholder}
              />
            </div>
            <button className="btn-primary" type="submit" disabled={searching}>
              {searching && <Spinner className="h-4 w-4 text-current" />}
              {t.common.search}
            </button>
          </form>
          {results && results.length === 0 && <Empty>{t.library.noResults}</Empty>}
          <div className="flex flex-col gap-2">
            {results?.map((r) => {
              const it = toItem(r);
              const done = quickDone.has(it.key);
              const exists = it.exists || done;
              const loading = quickBusy.has(it.key);
              return (
                <div key={it.key} className="flex items-start gap-2 rounded-lg hover:bg-surface-2">
                  <button
                    disabled={exists}
                    onClick={() => {
                      onPick?.(r);
                      setPicked(r);
                    }}
                    className="flex min-w-0 flex-1 gap-3 rounded-lg p-2 text-left disabled:opacity-50"
                  >
                    <Poster src={it.poster} title={it.title} className="w-14 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium">
                        {it.title} {it.year ? <span className="text-muted">({it.year})</span> : null}
                        {it.tag && <span className="chip ml-2 bg-accent/15 text-accent">{it.tag}</span>}
                      </div>
                      {exists && <div className="text-xs text-success">{t.library.alreadyAdded}</div>}
                      <p className="mt-1 line-clamp-2 text-xs text-muted">{it.overview}</p>
                    </div>
                  </button>
                  {onQuickAdd && !it.exists && (
                    <button
                      type="button"
                      className="btn-primary mr-2 mt-2 shrink-0 px-2.5 py-1.5 text-xs"
                      disabled={done || loading || profileId === "" || !root}
                      onClick={() => void quickAdd(r)}
                      title={`${t.common.add} ${it.title}`}
                    >
                      {loading ? <Spinner className="h-3.5 w-3.5 text-current" /> : done ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      {done ? t.common.added : t.common.add}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex gap-5">
          <Poster src={p.poster} title={p.title} className="w-36 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div>
              <h3 className="text-lg font-semibold">
                {p.title} {p.year ? <span className="text-muted">({p.year})</span> : null}
              </h3>
              <p className="mt-1 line-clamp-4 text-sm text-muted">{p.overview}</p>
            </div>
            <label>
              <span className="label">{t.library.qualityProfile}</span>
              <select className="input" value={profileId} onChange={(e) => setProfileId(Number(e.target.value))}>
                {profiles.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">{t.library.rootFolder}</span>
              <select className="input" value={root} onChange={(e) => setRoot(e.target.value)}>
                {rootFolders.map((f) => (
                  <option key={f.id} value={f.path}>
                    {f.path}
                    {f.freeSpace != null ? ` (${formatBytes(f.freeSpace)} libres)` : ""}
                  </option>
                ))}
              </select>
            </label>
            {extra}
            <div>
              <span className="label">{t.library.searchOnAdd}</span>
              <Segmented<AddSearchMode>
                label={t.library.searchOnAdd}
                value={searchMode}
                onChange={setSearchMode}
                options={[
                  { value: "none", label: t.library.addNoSearch },
                  { value: "auto", label: t.library.searchAuto },
                  { value: "manual", label: t.releases.manual },
                ]}
              />
              {searchMode === "manual" && <p className="mt-1.5 text-xs text-muted">{manualHint}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setPicked(null)}>
                {t.common.cancel}
              </button>
              <button className="btn-primary" onClick={add} disabled={busy || profileId === "" || !root}>
                {busy && <Spinner className="h-4 w-4 text-current" />}
                {t.common.add}
              </button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
