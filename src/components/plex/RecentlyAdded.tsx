import { ErrorPanel } from "@/components/ErrorPanel";
import { Poster } from "@/components/media/PosterCard";
import { Empty, Loading } from "@/components/ui";
import { plexPoster, plexTitle, plexWebUrl } from "@/api/plex";
import { usePlexRecent, usePlexServer } from "@/hooks/usePlex";
import { t } from "@/i18n/es";
import { openExternal } from "@/lib/tauri";

/** Últimas películas, temporadas y episodios que han entrado en Plex. */
export function RecentlyAdded() {
  const recent = usePlexRecent();
  const server = usePlexServer();
  if (recent.configured === false) return null;
  const machine = server.data?.machineIdentifier;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t.home.recentlyAdded}</h2>
      {recent.isLoading ? (
        <Loading />
      ) : recent.isError ? (
        <ErrorPanel service="plex" error={recent.error} onRetry={() => recent.refetch()} compact />
      ) : !recent.data?.length ? (
        <div className="card">
          <Empty />
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {recent.data.map((it) => {
            const { title, subtitle } = plexTitle(it);
            return (
              <button
                key={it.ratingKey}
                className="w-32 shrink-0 text-left"
                aria-label={title}
                title={t.plex.open}
                disabled={!machine}
                onClick={() => machine && void openExternal(plexWebUrl(machine, it.ratingKey))}
              >
                <Poster src={plexPoster(it)} title={title} />
                <div className="mt-1.5 truncate text-sm font-medium">{title}</div>
                {subtitle && <div className="truncate text-xs text-muted">{subtitle}</div>}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
