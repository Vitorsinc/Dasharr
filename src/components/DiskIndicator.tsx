import { useEffect, useRef, useState } from "react";
import { HardDrive } from "lucide-react";
import { isSystemDisk, type Disk } from "@/api/diskspace";
import { useDiskSpace } from "@/hooks/useDiskSpace";
import { ProgressBar } from "@/components/ui";
import { t } from "@/i18n/es";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/cn";

const used = (d: Disk) => (d.total ? 1 - d.free / d.total : undefined);
// Gris mientras sobra espacio: el disco no es de ningún servicio y no debe tomar su color.
const tone = (u: number | undefined) => (u == null ? "neutral" : u >= 0.95 ? "danger" : u >= 0.85 ? "warning" : "neutral");

function diskName(d: Disk) {
  const main = d.paths[0];
  return d.label || (isSystemDisk(d) ? `${t.disk.system} (${main})` : main) || t.disk.downloads;
}

function DiskRow({ disk }: { disk: Disk }) {
  const u = used(disk);
  return (
    <div className="flex flex-col gap-1 px-2 py-1.5" title={disk.paths.join(", ")}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate font-medium">{diskName(disk)}</span>
        <span className="shrink-0 tabular-nums text-muted">
          {disk.total ? `${formatBytes(disk.free)} / ${formatBytes(disk.total)}` : t.disk.freeOnly(formatBytes(disk.free))}
        </span>
      </div>
      {u != null && <ProgressBar value={u} tone={tone(u)} className="h-1" />}
    </div>
  );
}

/** Espacio en disco, al pie del menú lateral; al pulsarlo muestra todos los discos. */
export function DiskIndicator() {
  const { disks, noneConfigured } = useDiskSpace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (noneConfigured || disks.length === 0) return null;
  // El disco de contenido más lleno es el que interesa vigilar.
  const content = disks.filter((d) => !isSystemDisk(d));
  const main = (content.length ? content : disks).reduce((a, b) => ((used(b) ?? 0) > (used(a) ?? 0) ? b : a));
  const u = used(main);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-col gap-1.5 rounded-lg px-3 py-2 text-left text-xs text-muted transition-colors hover:bg-surface-2/60 hover:text-fg"
        aria-label={t.disk.title}
        aria-expanded={open}
        title={t.disk.title}
      >
        <span className="flex items-center gap-3">
          <HardDrive
            className={cn("h-[18px] w-[18px]", tone(u) === "danger" ? "text-danger" : tone(u) === "warning" && "text-warning")}
          />
          <span className="tabular-nums">{t.disk.freeOnly(formatBytes(main.free))}</span>
        </span>
        {u != null && <ProgressBar value={u} tone={tone(u)} className="h-1" />}
      </button>
      {open && (
        <div className="card absolute bottom-full left-0 z-50 mb-1 w-72 py-1 shadow-lg" role="dialog" aria-label={t.disk.title}>
          {disks.map((d) => (
            <DiskRow key={d.paths[0] ?? d.sources.join()} disk={d} />
          ))}
        </div>
      )}
    </div>
  );
}
