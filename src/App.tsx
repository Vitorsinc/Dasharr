import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, createBrowserRouter, Navigate, RouterProvider, type RouteObject } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { RouteError } from "@/components/RouteError";
import HomePage from "@/pages/Home";
import MoviesPage from "@/pages/Movies";
import SeriesPage from "@/pages/Series";
import DownloadsPage from "@/pages/Downloads";
import SearchPage from "@/pages/Search";
import SubtitlesPage from "@/pages/Subtitles";
import CalendarPage from "@/pages/Calendar";
import SettingsPage from "@/pages/Settings";
import HistoryPage from "@/pages/History";
import PlexPage from "@/pages/Plex";
import TrackersPage from "@/pages/Trackers";
import IndexersPage from "@/pages/Indexers";
import ActivityPage from "@/pages/Activity";
import ManagePage from "@/pages/Manage";

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { path: "/", element: <HomePage /> },
          { path: "/peliculas", element: <MoviesPage /> },
          { path: "/series", element: <SeriesPage key="series" kind="series" /> },
          { path: "/anime", element: <SeriesPage key="anime" kind="anime" /> },
          { path: "/descargas", element: <DownloadsPage /> },
          { path: "/buscar", element: <SearchPage /> },
          { path: "/subtitulos", element: <SubtitlesPage /> },
          { path: "/calendario", element: <CalendarPage /> },
          { path: "/historial", element: <HistoryPage /> },
          { path: "/plex", element: <PlexPage /> },
          { path: "/trackers", element: <TrackersPage /> },
          { path: "/indexadores/:tab?", element: <IndexersPage /> },
          { path: "/actividad/radarr/:tab?", element: <ActivityPage key="radarr" service="radarr" /> },
          { path: "/actividad/sonarr/:tab?", element: <ActivityPage key="sonarr" service="sonarr" /> },
          { path: "/gestion/radarr/:tab?", element: <ManagePage key="radarr" service="radarr" /> },
          { path: "/gestion/sonarr/:tab?", element: <ManagePage key="sonarr" service="sonarr" /> },
          { path: "/registro", element: <Navigate to="/ajustes/registro" replace /> },
          { path: "/ajustes/:tab?", element: <SettingsPage /> },
        ],
      },
    ],
  },
];

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 5_000 } },
  });
}

export default function App({ client, initialPath }: { client?: QueryClient; initialPath?: string }) {
  const router =
    typeof window !== "undefined" && !import.meta.env.VITEST
      ? createBrowserRouter(routes)
      : createMemoryRouter(routes, { initialEntries: [initialPath ?? "/"] });
  return (
    <QueryClientProvider client={client ?? makeQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
