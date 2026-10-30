import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { Sidebar, serviceForPath } from "./Sidebar";
import { useApplyTheme } from "@/hooks/usePrefs";
import { useDownloadNotifications } from "@/hooks/useDownloadNotifications";
import { useUpdateCheck } from "@/hooks/useUpdates";
import { usePlexNotifications } from "@/hooks/usePlex";

export function Layout() {
  useApplyTheme();
  useDownloadNotifications();
  usePlexNotifications();
  useUpdateCheck();
  // En <html> y no en este div para que los diálogos, que se montan fuera, también tomen el color del servicio.
  const service = serviceForPath(useLocation().pathname);
  useEffect(() => {
    if (service) document.documentElement.dataset.service = service;
    else delete document.documentElement.dataset.service;
  }, [service]);
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <Toaster position="bottom-right" theme="system" richColors closeButton />
    </div>
  );
}
