import { apiRequest } from "@/lib/tauri";
import { arrCommon, type ArrImage, type ArrRating, type HistoryRecord, type WantedKind } from "./arr";

export interface Movie {
  id: number;
  title: string;
  originalTitle?: string;
  year: number;
  overview?: string;
  hasFile: boolean;
  monitored: boolean;
  isAvailable?: boolean;
  status?: string;
  sizeOnDisk?: number;
  added?: string;
  runtime?: number;
  genres?: string[];
  tmdbId: number;
  imdbId?: string;
  qualityProfileId?: number;
  path?: string;
  rootFolderPath?: string;
  minimumAvailability?: MinimumAvailability;
  inCinemas?: string;
  digitalRelease?: string;
  physicalRelease?: string;
  images?: ArrImage[];
  movieFile?: { relativePath?: string; size?: number; quality?: { quality?: { name?: string } } };
  ratings?: Partial<Record<"imdb" | "tmdb" | "metacritic" | "rottenTomatoes" | "trakt", ArrRating>>;
}

export type MinimumAvailability = "announced" | "inCinemas" | "released";

export interface MovieEdit {
  qualityProfileId: number;
  minimumAvailability: MinimumAvailability;
  /** Carpeta completa de la película; si cambia, `moveFiles` decide si Radarr mueve los archivos. */
  path: string;
  moveFiles: boolean;
}

export interface AddMovieOptions {
  qualityProfileId: number;
  rootFolderPath: string;
  monitored: boolean;
  search: boolean;
}

const common = arrCommon("radarr");

export const radarr = {
  ...common,
  getMovies: () => apiRequest<Movie[]>("radarr", { path: "/api/v3/movie" }),
  lookup: (term: string) => apiRequest<Movie[]>("radarr", { path: "/api/v3/movie/lookup", query: { term } }),
  addMovie: (movie: Movie, o: AddMovieOptions) =>
    apiRequest<Movie>("radarr", {
      method: "POST",
      path: "/api/v3/movie",
      json: {
        ...movie,
        id: undefined,
        qualityProfileId: o.qualityProfileId,
        rootFolderPath: o.rootFolderPath,
        monitored: o.monitored,
        minimumAvailability: "released",
        addOptions: { searchForMovie: o.search },
      },
    }),
  setMonitored: (movie: Movie, monitored: boolean) =>
    apiRequest<Movie>("radarr", { method: "PUT", path: `/api/v3/movie/${movie.id}`, json: { ...movie, monitored } }),
  deleteMovie: (id: number, deleteFiles: boolean) =>
    apiRequest<unknown>("radarr", { method: "DELETE", path: `/api/v3/movie/${id}`, query: { deleteFiles, addImportExclusion: false } }),
  updateMovie: (movie: Movie, e: MovieEdit) =>
    apiRequest<Movie>("radarr", {
      method: "PUT",
      path: `/api/v3/movie/${movie.id}`,
      query: { moveFiles: e.moveFiles && e.path !== movie.path },
      json: { ...movie, qualityProfileId: e.qualityProfileId, minimumAvailability: e.minimumAvailability, path: e.path },
    }),
  search: (movieIds: number[]) => common.command({ name: "MoviesSearch", movieIds }),
  getWanted: async (kind: WantedKind) => (await common.getWanted<Movie>(kind)).records ?? [],
  /** Busca todas las monitorizadas que faltan (o que no llegan a la calidad objetivo), como el botón de Radarr. */
  searchWanted: (kind: WantedKind) => common.command({ name: kind === "missing" ? "MissingMoviesSearch" : "CutoffUnmetMoviesSearch" }),
  getHistory: (movieId: number) =>
    apiRequest<HistoryRecord[]>("radarr", { path: "/api/v3/history/movie", query: { movieId } }).then((l) =>
      [...l].sort((a, b) => b.date.localeCompare(a.date)),
    ),
  getCalendar: (start: Date, end: Date) =>
    apiRequest<Movie[]>("radarr", {
      path: "/api/v3/calendar",
      query: { start: start.toISOString(), end: end.toISOString(), unmonitored: false },
    }),
};

/** Fecha de estreno más relevante para el calendario: digital, física o en cines. */
export function movieReleaseDate(m: Movie): string | undefined {
  return m.digitalRelease ?? m.physicalRelease ?? m.inCinemas;
}
