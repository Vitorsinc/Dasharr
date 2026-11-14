import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { NumberInput } from "@/components/ui";
import { t } from "@/i18n/es";
import { qbit } from "@/api/qbit";
import { trackerHost } from "@/api/duplicates";
import { usePrefs } from "@/hooks/usePrefs";
import { REFRESH, useServiceQuery } from "@/hooks/useServiceQuery";

/** Ajustes → Contenido: días mínimos de siembra por tracker (los que hay en qBittorrent y los añadidos a mano). */
export function SeedMinimums() {
  const [prefs, setPrefs] = usePrefs();
  const torrents = useServiceQuery("qbittorrent", ["tracker-hosts"], qbit.getTorrents, { staleTime: REFRESH.library });
  const [adding, setAdding] = useState("");

  const rows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tr of torrents.data ?? []) {
      const host = trackerHost(tr.tracker);
      if (host) counts.set(host, (counts.get(host) ?? 0) + 1);
    }
    for (const host of Object.keys(prefs.seedMinDays)) if (!counts.has(host)) counts.set(host, 0);
    return [...counts].sort((a, b) => a[0].localeCompare(b[0]));
  }, [torrents.data, prefs.seedMinDays]);

  const set = (host: string, days: number) => setPrefs({ seedMinDays: { ...prefs.seedMinDays, [host]: Math.max(0, days) } });
  const add = () => {
    const host = trackerHost(/^\w+:\/\//.test(adding) ? adding : `https://${adding.trim()}`);
    if (!host) return;
    if (!(host in prefs.seedMinDays)) set(host, 0);
    setAdding("");
  };

  return (
    <div className="card max-w-xl divide-y divide-border">
      {rows.length === 0 && <div className="px-4 py-3 text-sm text-muted">{t.duplicates.seedMin.empty}</div>}
      {rows.map(([host, count]) => (
        <div key={host} className="flex items-center gap-3 px-4 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{host}</div>
            {count > 0 && <div className="text-xs text-muted">{t.duplicates.seedMin.torrents(count)}</div>}
          </div>
          <NumberInput
            className="input w-20 text-right"
            min={0}
            value={prefs.seedMinDays[host] ?? 0}
            onValue={(n) => set(host, n)}
            aria-label={t.duplicates.seedMin.days(host)}
          />
          <span className="text-sm text-muted">{t.duplicates.seedMin.unit}</span>
        </div>
      ))}
      <form
        className="flex items-center gap-2 px-4 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className="input flex-1"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder={t.duplicates.seedMin.addPlaceholder}
          aria-label={t.duplicates.seedMin.add}
        />
        <button className="btn-ghost" type="submit" disabled={!adding.trim()}>
          <Plus className="h-4 w-4" /> {t.duplicates.seedMin.add}
        </button>
      </form>
    </div>
  );
}
