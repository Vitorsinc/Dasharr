import { Outlet } from "react-router-dom";
import { Toaster } from "sonner";
import { Sidebar } from "./Sidebar";
import { useApplyTheme } from "@/hooks/usePrefs";
import { useDownloadNotifications } from "@/hooks/useDownloadNotifications";
import { useUpdateCheck } from "@/hooks/useUpdates";

export function Layout() {
  useApplyTheme();
  useDownloadNotifications();
  useUpdateCheck();
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
