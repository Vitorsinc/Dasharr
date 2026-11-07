import { useEffect, useMemo, useState } from "react";
import { Ban, Plus, RefreshCw } from "lucide-react";
import { Dialog } from "@/components/Dialog";
import { Toggle } from "@/components/ui";
import { MonitorIcon } from "@/components/media/MonitorToggle";
import { Poster } from "@/components/media/PosterCard";
import { libState, type LibState } from "@/components/media/library";
import { posterUrl } from "@/api/arr";
import { radarr, type Collection, type CollectionEdit, type CollectionMovie, type MinimumAvailability, type Movie } from "@/api/radarr";
import { useRadarrMeta } from "@/hooks/useArr";
import { useRun } from "@/hooks/useArrManage";
import { usePrefs } from "@/hooks/usePrefs";
import { movieDefaultsFor } from "@/lib/anime";
import { cn } from "@/lib/cn";
import { t } from "@/i18n/es";
import { MovieDetail } from "@/pages/Movies/MovieDetail";

const stateStyle: Record<LibState | "notInLibrary" | "excluded", { dot: string; label: string }> = {
  downloaded: { dot: "bg-success", label: t.library.statusDownloaded },
  missing: { dot: "bg-danger", label: t.library.statusMissing },
  unmonitored: { dot: "bg-muted", label: t.library.statusUnmonitored },
  partial: { dot: "bg-warning", label: t.library.statusPartial },
  notInLibrary: { dot: "bg-accent", label: t.collections.notInLibrary },
  excluded: { dot: "bg-muted", label: t.collections.excluded },
};

/** Cuántas tiene en la biblioteca de las que cuentan (las excluidas que no tiene no cuentan). */
export function collectionCounts(c: Collection) {
  const have = c.movies.filter((m) => m.isExisting).length;
  return { have, total: have + c.missingMovies };
}

const AVAILABILITY: MinimumAvailability[] = ["announced", "inCinemas", "released"];

function trimSlash(p?: string) {
  return (p ?? "").replace(/[\\/]+$/, "");
}

/** Película de la colección: abre la ficha si está en la biblioteca; si no, botón para añadirla. */
function MovieTile({
  m,
  owned,
  busy,
  onOpen,
  onAdd,
}: {
  m: CollectionMovie;
  owned?: Movie;
  busy: boolean;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const state = owned
    ? libState({ ...owned, downloaded: owned.hasFile, missing: owned.monitored && !owned.hasFile })
    : m.isExcluded
      ? "excluded"
      : "notInLibrary";
  const s = stateStyle[state];
  const poster = owned ? posterUrl("radarr", owned, 250) : posterUrl("radarr", { images: m.images });
  const label = `${m.title} (${m.year || "?"})`;
  const body = (
    <>
      <div className={cn("relative rounded-lg", !owned && "opacity-70 transition-opacity group-hover:opacity-100")}>
        <Poster src={poster} title={m.title} />
        <span
          className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur"
          title={m.isExcluded && !owned ? t.collections.excludedHint : s.label}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
          {s.label}
        </span>
      </div>
      <div className="min-w-0 px-0.5">
        <div className="truncate text-sm font-medium" title={m.title}>
          {m.title}
        </div>
        <div className="text-xs text-muted">{m.year || "—"}</div>
      </div>
    </>
  );
  if (owned)
    return (
      <button className="group flex flex-col gap-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg" aria-label={label} onClick={onOpen}>
        {body}
      </button>
    );
  return (
    <div className="group flex flex-col gap-1.5">
      {body}
      <button className="btn-outline justify-center px-2 py-1 text-xs" disabled={busy} aria-label={t.collections.addMovie(m.title)} onClick={onAdd}>
        {m.isExcluded ? <Ban className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />} {t.collections.add}
      </button>
    </div>
  );
}

function Settings({ c }: { c: Collection }) {
  const meta = useRadarrMeta();
  const run = useRun("radarr");
  const [{ movieDefaults }] = usePrefs();
  const roots = meta.roots.data ?? [];
  const profiles = meta.profiles.data ?? [];
  const preset = movieDefaultsFor(roots, profiles, movieDefaults);
  const initial = useMemo<Omit<CollectionEdit, "monitored">>(
    () => ({
      qualityProfileId: c.qualityProfileId || preset.qualityProfileId || 0,
      rootFolderPath: trimSlash(c.rootFolderPath) || trimSlash(preset.rootFolderPath),
      minimumAvailability: c.minimumAvailability ?? "released",
      searchOnAdd: c.searchOnAdd,
    }),
    [c, preset.qualityProfileId, preset.rootFolderPath],
  );
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial]);
  const dirty =
    v.qualityProfileId !== c.qualityProfileId ||
    v.rootFolderPath !== trimSlash(c.rootFolderPath) ||
    v.minimumAvailability !== c.minimumAvailability ||
    v.searchOnAdd !== c.searchOnAdd;
  const rootOptions = roots.map((r) => trimSlash(r.path));
  if (v.rootFolderPath && !rootOptions.includes(v.rootFolderPath)) rootOptions.unshift(v.rootFolderPath);

  const setMonitored = async (monitored: boolean) => {
    // Al monitorizar se guardan también los ajustes elegidos: son los que usará Radarr para añadir.
    const ok = await run(
      () => radarr.updateCollection(c, { ...v, monitored }),
      monitored ? t.collections.monitoredOn(c.title) : t.collections.monitoredOff(c.title),
    );
    if (ok && monitored) await run(() => radarr.refreshCollection(c.id));
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface-2/40 p-4" aria-label={t.collections.settings}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium">{t.collections.monitorCollection}</div>
          <div className="text-xs text-muted">{t.collections.monitoredHint}</div>
        </div>
        <Toggle checked={c.monitored} onChange={setMonitored} label={t.collections.monitorCollection} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className="label">{t.library.qualityProfile}</span>
          <select className="input" value={v.qualityProfileId} onChange={(e) => setV({ ...v, qualityProfileId: Number(e.target.value) })}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">{t.library.rootFolder}</span>
          <select className="input" value={v.rootFolderPath} onChange={(e) => setV({ ...v, rootFolderPath: e.target.value })}>
            {rootOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">{t.editMedia.minimumAvailability}</span>
          <select
            className="input"
            value={v.minimumAvailability}
            onChange={(e) => setV({ ...v, minimumAvailability: e.target.value as MinimumAvailability })}
          >
            {AVAILABILITY.map((a) => (
              <option key={a} value={a}>
                {t.editMedia.availability[a]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm" title={t.collections.searchOnAddHint}>
          <input type="checkbox" className="h-4 w-4" checked={v.searchOnAdd} onChange={(e) => setV({ ...v, searchOnAdd: e.target.checked })} />
          {t.collections.searchOnAdd}
        </label>
        <button
          className="btn-primary"
          disabled={!dirty || !v.qualityProfileId || !v.rootFolderPath}
          onClick={() => run(() => radarr.updateCollection(c, v), t.collections.saved)}
        >
          {t.common.save}
        </button>
      </div>
    </section>
  );
}

export function CollectionDetail({ collection: c, library, onClose }: { collection: Collection | null; library: Movie[]; onClose: () => void }) {
  const run = useRun("radarr");
  const meta = useRadarrMeta();
  const [{ movieDefaults }] = usePrefs();
  const [busy, setBusy] = useState(false);
  const [movieId, setMovieId] = useState<number | null>(null);
  const byTmdb = useMemo(() => new Map(library.map((m) => [m.tmdbId, m])), [library]);
  if (!c) return null;
  const { have, total } = collectionCounts(c);
  const movies = [...c.movies].sort((a, b) => (a.year || 9999) - (b.year || 9999));
  const missing = movies.filter((m) => !m.isExisting && !m.isExcluded && !byTmdb.has(m.tmdbId));
  const owned = library.find((m) => m.id === movieId) ?? null;

  const preset = movieDefaultsFor(meta.roots.data ?? [], meta.profiles.data ?? [], movieDefaults);
  const addOptions = {
    qualityProfileId: c.qualityProfileId || preset.qualityProfileId || 0,
    rootFolderPath: trimSlash(c.rootFolderPath) || trimSlash(preset.rootFolderPath),
    minimumAvailability: c.minimumAvailability ?? "released",
    search: c.searchOnAdd,
  };
  const add = async (list: CollectionMovie[]) => {
    if (!addOptions.rootFolderPath || !addOptions.qualityProfileId) {
      await run(() => Promise.reject(new Error(t.collections.noRoot)));
      return;
    }
    setBusy(true);
    try {
      await run(
        async () => {
          for (const m of list) await radarr.addCollectionMovie(m, addOptions);
        },
        list.length === 1 ? t.collections.addedOne(list[0].title) : t.collections.addedMany(list.length),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()} title={c.title} wide>
        <div className="flex flex-col gap-6">
          <div className="flex gap-6">
            <Poster src={posterUrl("radarr", { images: c.images })} title={c.title} className="hidden w-40 shrink-0 sm:block" />
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="text-sm text-muted">{t.collections.have(have, total)}</div>
              {c.overview && <p className="text-sm leading-relaxed text-muted">{c.overview}</p>}
              <Settings c={c} />
            </div>
          </div>
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-xl">{t.collections.movies}</h2>
              <button
                className="btn-ghost px-2 py-1 text-xs"
                onClick={() => run(() => radarr.setCollectionMoviesMonitored(c.id, true), t.collections.moviesMonitored)}
              >
                <MonitorIcon monitored className="h-3.5 w-3.5" /> {t.collections.monitorMovies}
              </button>
              <button
                className="btn-ghost px-2 py-1 text-xs"
                onClick={() => run(() => radarr.setCollectionMoviesMonitored(c.id, false), t.collections.moviesUnmonitored)}
              >
                <MonitorIcon monitored={false} className="h-3.5 w-3.5" /> {t.collections.unmonitorMovies}
              </button>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => run(() => radarr.refreshCollection(c.id), t.collections.refreshStarted)}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> {t.collections.refresh}
              </button>
              {missing.length > 0 && (
                <button className="btn-primary" disabled={busy} onClick={() => add(missing)}>
                  <Plus className="h-4 w-4" aria-hidden /> {t.collections.addMissing(missing.length)}
                </button>
              )}
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-x-4 gap-y-5">
              {movies.map((m) => {
                const mine = byTmdb.get(m.tmdbId);
                return (
                  <MovieTile key={m.tmdbId} m={m} owned={mine} busy={busy} onOpen={() => mine && setMovieId(mine.id)} onAdd={() => add([m])} />
                );
              })}
            </div>
          </section>
        </div>
      </Dialog>
      <MovieDetail movie={owned} onClose={() => setMovieId(null)} />
    </>
  );
}
