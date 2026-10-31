import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileX, FolderSearch, Pencil, RefreshCw, Search, TextCursorInput, Trash2, User } from "lucide-react";
import { MonitorIcon } from "@/components/media/MonitorToggle";
import { toast } from "sonner";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { RenameDialog } from "@/components/media/RenameDialog";
import { ArrRatings } from "@/components/media/ArrRatings";
import { FaInfo } from "@/components/media/FilmAffinity";
import { Poster } from "@/components/media/PosterCard";
import { ReleaseSearchDialog } from "@/components/media/ReleaseSearchDialog";
import { ArrHistory } from "@/components/media/ArrHistory";
import { EditMediaDialog } from "@/components/media/EditMediaDialog";
import { MediaTags } from "@/components/media/TagPicker";
import { DeleteMediaDialog } from "@/components/media/DeleteMediaDialog";
import { useRadarrMeta } from "@/hooks/useArr";
import { useMovieReleases } from "@/hooks/useMovieReleases";
import { RELEASE_KINDS } from "@/lib/releases";
import { posterUrl } from "@/api/arr";
import { movieRefs } from "@/api/tracearr";
import { MovieWatchHistory } from "@/components/watch/WatchHistory";
import { PlexBadge } from "@/components/plex/PlexBadge";
import { movieItem } from "@/api/filmaffinity";
import { radarr, type MinimumAvailability, type Movie } from "@/api/radarr";
import { t } from "@/i18n/es";
import { errorMessage } from "@/lib/errors";
import { formatBytes } from "@/lib/format";

function Info({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

const fullDate = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" });

/** Estrenos en cines, digital y física, con las fechas del país elegido en Ajustes si hay clave de TMDB. */
function ReleaseInfo({ movie }: { movie: Movie }) {
  const releases = useMovieReleases([movie])(movie);
  return (
    <>
      {RELEASE_KINDS.map((k) => (
        <Info key={k} label={t.premieres.kind[k]} value={releases[k] ? fullDate.format(releases[k]) : undefined} />
      ))}
    </>
  );
}

export function MovieDetail({ movie, onClose }: { movie: Movie | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [manual, setManual] = useState(false);
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deletingFile, setDeletingFile] = useState(false);
  const [availability, setAvailability] = useState<MinimumAvailability>("released");
  const meta = useRadarrMeta();
  if (!movie) return null;
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast.success(ok);
      await qc.invalidateQueries({ queryKey: ["radarr"] });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const status = movie.hasFile ? t.library.statusDownloaded : movie.monitored ? t.library.statusMissing : t.library.statusUnmonitored;
  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()} title={`${movie.title} (${movie.year})`} wide>
        <div className="flex gap-6">
          <Poster src={posterUrl("radarr", movie)} title={movie.title} className="w-48 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            {movie.overview && <p className="text-sm leading-relaxed text-muted">{movie.overview}</p>}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <FaInfo item={movieItem(movie)} />
              <ArrRatings ratings={movie.ratings} />
              <Info label={t.library.status} value={status} />
              <Info label={t.library.quality} value={movie.movieFile?.quality?.quality?.name} />
              <Info label={t.library.size} value={movie.sizeOnDisk ? formatBytes(movie.sizeOnDisk) : undefined} />
              <Info label="Duración" value={movie.runtime ? t.library.runtime(movie.runtime) : undefined} />
              <ReleaseInfo movie={movie} />
            </div>
            {movie.movieFile?.relativePath && (
              <div className="flex items-end gap-2">
                <Info label={t.library.file} value={<span className="break-all font-mono text-xs">{movie.movieFile.relativePath}</span>} />
                {movie.movieFile.id != null && (
                  <button
                    className="btn-ghost shrink-0 p-1 text-muted hover:text-danger"
                    title={t.seriesTools.deleteFile}
                    aria-label={t.seriesTools.deleteFile}
                    onClick={() => setDeletingFile(true)}
                  >
                    <FileX className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
            )}
            {movie.genres?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {movie.genres.map((g) => (
                  <span key={g} className="chip bg-surface-2 text-muted">
                    {g}
                  </span>
                ))}
              </div>
            ) : null}
            <MediaTags service="radarr" value={movie.tags ?? []} onChange={(tags) => run(() => radarr.setTags(movie, tags), t.manage.tags.saved)} />
            <MovieWatchHistory refs={movieRefs(movie)} />
            <PlexBadge kind="movie" ids={{ tmdbId: movie.tmdbId, imdbId: movie.imdbId }} />
            <ArrHistory service="radarr" id={movie.id} load={() => radarr.getHistory(movie.id)} />
            <div className="mt-auto flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => run(() => radarr.search([movie.id]), t.library.searchStarted)}>
                <Search className="h-4 w-4" /> {t.library.searchNow}
              </button>
              <button className="btn-outline" onClick={() => setManual(true)}>
                <User className="h-4 w-4" /> {t.releases.manual}
              </button>
              <button className="btn-outline" onClick={() => run(() => radarr.setMonitored(movie, !movie.monitored).then(onClose))}>
                <MonitorIcon monitored={movie.monitored} />
                {movie.monitored ? t.library.monitorOff : t.library.monitorOn}
              </button>
              <button
                className="btn-outline"
                onClick={() => {
                  setAvailability(movie.minimumAvailability ?? "released");
                  setEditing(true);
                }}
              >
                <Pencil className="h-4 w-4" /> {t.editMedia.edit}
              </button>
              <button className="btn-ghost ml-auto text-danger" onClick={() => setConfirm(true)}>
                <Trash2 className="h-4 w-4" /> {t.common.delete}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-ghost px-2 py-1 text-xs"
                title={t.movieTools.refreshHint}
                onClick={() => run(() => radarr.refreshMovie(movie.id), t.movieTools.refreshStarted)}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> {t.seriesTools.refresh}
              </button>
              <button
                className="btn-ghost px-2 py-1 text-xs"
                title={t.movieTools.rescanHint}
                onClick={() => run(() => radarr.rescanMovie(movie.id), t.seriesTools.rescanStarted)}
              >
                <FolderSearch className="h-3.5 w-3.5" aria-hidden /> {t.seriesTools.rescan}
              </button>
              {movie.hasFile && (
                <button className="btn-ghost px-2 py-1 text-xs" title={t.movieTools.renameHint} onClick={() => setRenaming(true)}>
                  <TextCursorInput className="h-3.5 w-3.5" aria-hidden /> {t.seriesTools.rename}
                </button>
              )}
            </div>
          </div>
        </div>
      </Dialog>
      <ReleaseSearchDialog
        service="radarr"
        query={manual ? { movieId: movie.id } : null}
        what={movie.title}
        onClose={() => setManual(false)}
      />
      {editing && (
        <EditMediaDialog
          title={t.editMedia.titleMovie(movie.title)}
          profiles={meta.profiles.data ?? []}
          rootFolders={meta.roots.data ?? []}
          initial={movie}
          extra={
            <label>
              <span className="label">{t.editMedia.minimumAvailability}</span>
              <select className="input" value={availability} onChange={(e) => setAvailability(e.target.value as MinimumAvailability)}>
                {(["announced", "inCinemas", "released"] as const).map((v) => (
                  <option key={v} value={v}>
                    {t.editMedia.availability[v]}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-muted">{t.editMedia.availabilityHint}</span>
            </label>
          }
          onSave={async (v) => {
            await radarr.updateMovie(movie, { ...v, minimumAvailability: availability });
            await qc.invalidateQueries({ queryKey: ["radarr"] });
          }}
          onClose={() => setEditing(false)}
        />
      )}
      {renaming && (
        <RenameDialog
          service="radarr"
          title={t.seriesTools.renameTitle(movie.title)}
          queryKey={["movie", movie.id]}
          load={async () =>
            (await radarr.getRenamePreview(movie.id)).map((r) => ({ fileId: r.movieFileId, existingPath: r.existingPath, newPath: r.newPath }))
          }
          onRename={() => radarr.renameMovie(movie.id)}
          onClose={() => setRenaming(false)}
        />
      )}
      <ConfirmDialog
        open={deletingFile}
        onOpenChange={setDeletingFile}
        title={t.movieTools.deleteFileTitle}
        message={t.movieTools.deleteFileMessage(movie.title)}
        onConfirm={() => movie.movieFile?.id != null && run(() => radarr.deleteMovieFile(movie.movieFile!.id!), t.seriesTools.fileDeleted)}
      />
      <DeleteMediaDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t.library.deleteMovie}
        message={t.library.deleteMessage(movie.title)}
        exclusionLabel={t.library.addExclusion}
        onConfirm={(o) => run(() => radarr.deleteMovie(movie.id, o).then(onClose))}
      />
    </>
  );
}
