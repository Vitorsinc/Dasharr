import { useEffect, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/Dialog";
import { Empty, Spinner } from "@/components/ui";
import { t } from "@/i18n/es";
import { errorMessage } from "@/lib/errors";
import type { QualityProfile, RootFolder } from "@/api/arr";
import { formatBytes } from "@/lib/format";
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

export interface AddOptions {
  qualityProfileId: number;
  rootFolderPath: string;
  search: boolean;
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
  onAdd,
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
  onAdd: (r: T, o: AddOptions) => Promise<void>;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<T[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<T | null>(null);
  const [profileId, setProfileId] = useState<number | "">("");
  const [root, setRoot] = useState("");
  const [search, setSearch] = useState(true);
  const [busy, setBusy] = useState(false);

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
    }
  }, [open]);

  async function doLookup(e?: React.FormEvent) {
    e?.preventDefault();
    if (!term.trim()) return;
    setSearching(true);
    setPicked(null);
    try {
      setResults(await lookup(term.trim()));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSearching(false);
    }
  }

  async function add() {
    if (!picked || profileId === "" || !root) return;
    setBusy(true);
    try {
      await onAdd(picked, { qualityProfileId: profileId, rootFolderPath: root, search });
      toast.success(t.library.added(toItem(picked).title));
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
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
              {searching && <Spinner className="h-4 w-4 text-white" />}
              {t.common.search}
            </button>
          </form>
          {results && results.length === 0 && <Empty>{t.library.noResults}</Empty>}
          <div className="flex flex-col gap-2">
            {results?.map((r) => {
              const it = toItem(r);
              return (
                <button
                  key={it.key}
                  disabled={it.exists}
                  onClick={() => {
                    onPick?.(r);
                    setPicked(r);
                  }}
                  className="flex gap-3 rounded-lg p-2 text-left hover:bg-surface-2 disabled:opacity-50"
                >
                  <Poster src={it.poster} title={it.title} className="w-14 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium">
                      {it.title} {it.year ? <span className="text-muted">({it.year})</span> : null}
                      {it.tag && <span className="chip ml-2 bg-accent/15 text-accent">{it.tag}</span>}
                    </div>
                    {it.exists && <div className="text-xs text-success">{t.library.alreadyAdded}</div>}
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{it.overview}</p>
                  </div>
                </button>
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
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={search} onChange={(e) => setSearch(e.target.checked)} />
              {t.library.searchOnAdd}
            </label>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setPicked(null)}>
                {t.common.cancel}
              </button>
              <button className="btn-primary" onClick={add} disabled={busy || profileId === "" || !root}>
                {busy && <Spinner className="h-4 w-4 text-white" />}
                {t.common.add}
              </button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
