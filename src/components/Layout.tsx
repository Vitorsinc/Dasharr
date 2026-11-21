import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { MobileNav, Sidebar, serviceForPath } from "./Sidebar";
import { useIsNarrow } from "@/hooks/useIsNarrow";
import { useApplyTheme } from "@/hooks/usePrefs";
import { useDownloadNotifications } from "@/hooks/useDownloadNotifications";
import { useUpdateCheck } from "@/hooks/useUpdates";
import { usePlexNotifications } from "@/hooks/usePlex";
import { useGoogleSync } from "@/hooks/useGoogleSync";

export function Layout() {
  useApplyTheme();
  useDownloadNotifications();
  usePlexNotifications();
  useUpdateCheck();
  useGoogleSync();
  // En <html> y no en este div para que los diálogos, que se montan fuera, también tomen el color del servicio.
  const service = serviceForPath(useLocation().pathname);
  useEffect(() => {
    if (service) document.documentElement.dataset.service = service;
    else delete document.documentElement.dataset.service;
  }, [service]);
  const narrow = useIsNarrow();
  return (
    <div className="flex h-full flex-col md:flex-row">
      {!narrow && <Sidebar />}
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      {narrow && <MobileNav />}
      <Toaster
        position={narrow ? "top-center" : "bottom-right"}
        theme="system"
        richColors
        closeButton
        mobileOffset={{ top: 12, left: 12, right: 12 }}
      />
    </div>
  );
}
