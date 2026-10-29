import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, ListFilter, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { Poster } from "@/components/media/PosterCard";
import { ReleaseSearchDialog } from "@/components/media/ReleaseSearchDialog";
import { posterUrl } from "@/api/arr";
import { PlexBadge } from "@/components/plex/PlexBadge";
import { radarr, type Movie } from "@/api/radarr";
import { t } from "@/i18n/es";
import { errorMessage } from "@/lib/errors";
import { formatBytes, formatDate } from "@/lib/format";

function Info({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

export function MovieDetail({ movie, onClose }: { movie: Movie | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [manual, setManual] = useState(false);
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
              <Info label={t.library.status} value={status} />
              <Info label={t.library.quality} value={movie.movieFile?.quality?.quality?.name} />
              <Info label={t.library.size} value={movie.sizeOnDisk ? formatBytes(movie.sizeOnDisk) : undefined} />
              <Info label="Duración" value={movie.runtime ? t.library.runtime(movie.runtime) : undefined} />
              <Info label="En cines" value={movie.inCinemas ? formatDate(movie.inCinemas) : undefined} />
              <Info label="Digital" value={movie.digitalRelease ? formatDate(movie.digitalRelease) : undefined} />
            </div>
            {movie.movieFile?.relativePath && (
              <Info label={t.library.file} value={<span className="break-all font-mono text-xs">{movie.movieFile.relativePath}</span>} />
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
            <PlexBadge kind="movie" ids={{ tmdbId: movie.tmdbId, imdbId: movie.imdbId }} />
            <div className="mt-auto flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => run(() => radarr.search([movie.id]), t.library.searchStarted)}>
                <Search className="h-4 w-4" /> {t.library.searchNow}
              </button>
              <button className="btn-outline" onClick={() => setManual(true)}>
                <ListFilter className="h-4 w-4" /> {t.releases.manual}
              </button>
              <button className="btn-outline" onClick={() => run(() => radarr.setMonitored(movie, !movie.monitored).then(onClose))}>
                {movie.monitored ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {movie.monitored ? t.library.monitorOff : t.library.monitorOn}
              </button>
              <button className="btn-ghost ml-auto text-danger" onClick={() => setConfirm(true)}>
                <Trash2 className="h-4 w-4" /> {t.common.delete}
              </button>
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
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t.library.deleteMovie}
        message={t.library.deleteMessage(movie.title)}
        checkboxLabel={t.common.deleteFiles}
        onConfirm={(deleteFiles) => run(() => radarr.deleteMovie(movie.id, deleteFiles).then(onClose))}
      />
    </>
  );
}
