import { useState } from "react";
import { ExternalLink, Send } from "lucide-react";
import { toast } from "sonner";
import { Empty, Segmented, Spinner } from "@/components/ui";
import { t } from "@/i18n/es";
import { sendDealToQbit, type TrackerDeal, type TrackerDeals } from "@/api/trackers";
import { useCategories } from "@/hooks/useTorrents";
import { errorMessage } from "@/lib/errors";
import { formatAge, formatBytes } from "@/lib/format";
import { cn } from "@/lib/cn";
import { openExternal } from "@/lib/tauri";

type Kind = "all" | "free" | "double";
type Sort = "newest" | "seeders" | "size";
type Row = TrackerDeal & { indexerId: number };

const PAGE = 40;

function sortRows(rows: Row[], by: Sort) {
  const out = [...rows];
  if (by === "newest") out.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  if (by === "seeders") out.sort((a, b) => (b.seeders ?? -1) - (a.seeders ?? -1));
  if (by === "size") out.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
  return out;
}

function Poster({ src }: { src: string | null }) {
  return src ? (
    <img src={src} alt="" loading="lazy" className="h-12 w-8 shrink-0 rounded object-cover" />
  ) : (
    <div className="h-12 w-8 shrink-0 rounded bg-surface-2" aria-hidden />
  );
}

function Badges({ d }: { d: TrackerDeal }) {
  return (
    <>
      {d.freeleech > 0 && <span className="chip bg-success/15 text-success">{t.trackers.deals.freeBadge(d.freeleech)}</span>}
      {d.doubleUpload && <span className="chip bg-accent/15 text-accent">{t.trackers.deals.doubleBadge}</span>}
    </>
  );
}

function DealRow({ d, sending, onSend }: { d: Row; sending: boolean; onSend: () => void }) {
  const details = [d.category, d.resolution, d.releaseType].filter(Boolean).join(" · ");
  const seeders = d.seeders ?? 0;
  return (
    <li className="flex items-center gap-3 px-3 py-2 hover:bg-surface-2/60" aria-label={d.name}>
      <Poster src={d.poster} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" title={d.name}>
          {d.name}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <Badges d={d} />
          {details && <span className="truncate">{details}</span>}
        </div>
      </div>
      <div className="hidden w-20 text-right text-xs tabular-nums text-muted sm:block">{formatBytes(d.size)}</div>
      <div className="w-20 text-right text-xs tabular-nums" title={`${t.search.seeders} / ${t.search.leechers}`}>
        <span className={cn(seeders > 10 ? "text-success" : seeders > 0 ? "text-warning" : "text-danger")}>{d.seeders ?? "—"}</span>
        <span className="text-muted"> / {d.leechers ?? "—"}</span>
      </div>
      <div className="hidden w-14 text-right text-xs tabular-nums text-muted md:block">{formatAge(d.createdAt)}</div>
      <div className="flex shrink-0 gap-0.5">
        {d.detailsUrl && (
          <button
            type="button"
            className="btn-ghost p-1.5"
            onClick={() => void openExternal(d.detailsUrl!)}
            title={t.trackers.deals.openTorrent}
            aria-label={`${t.trackers.deals.openTorrent}: ${d.name}`}
          >
            <ExternalLink className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          className="btn-ghost p-1.5 text-accent"
          disabled={sending}
          onClick={onSend}
          title={t.search.send}
          aria-label={`${t.search.send}: ${d.name}`}
        >
          {sending ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </li>
  );
}

/** Torrents en freeleech o con doble subida del tracker elegido arriba, con botón para mandarlos a qBittorrent. */
export function Deals({ tracker, loading }: { tracker: TrackerDeals | undefined; loading: boolean }) {
  const qbitCategories = useCategories();
  const [kind, setKind] = useState<Kind>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [qbCategory, setQbCategory] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [sending, setSending] = useState<string | null>(null);

  const all: Row[] = tracker?.status === "ok" ? tracker.torrents.map((d) => ({ ...d, indexerId: tracker.indexerId })) : [];
  const rows = sortRows(all.filter((d) => kind === "all" || (kind === "free" ? d.freeleech > 0 : d.doubleUpload)), sort);

  async function send(d: Row) {
    const key = `${d.indexerId}:${d.id}`;
    setSending(key);
    try {
      await sendDealToQbit(d.indexerId, d, qbCategory || undefined);
      toast.success(t.search.sent);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(null);
    }
  }

  if (!tracker && !loading) return null;
  return (
    <section className="flex flex-col gap-3" aria-label={t.trackers.deals.title}>
      <div>
        <h2 className="text-lg font-semibold">
          {t.trackers.deals.title}
          {tracker && <span className="text-muted"> · {tracker.name}</span>}
        </h2>
        <p className="text-sm text-muted">{t.trackers.deals.hint}</p>
      </div>
      {loading ? (
        <div className="card grid place-items-center py-10">
          <Spinner className="h-5 w-5" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
            <Segmented<Kind>
              label={t.trackers.deals.kind}
              value={kind}
              onChange={(v) => {
                setKind(v);
                setShown(PAGE);
              }}
              options={[
                { value: "all", label: t.trackers.deals.all },
                { value: "free", label: t.trackers.deals.freeleech },
                { value: "double", label: t.trackers.deals.double },
              ]}
            />
            <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t.trackers.deals.sort}>
              <option value="newest">{t.trackers.deals.newest}</option>
              <option value="seeders">{t.trackers.deals.seeders}</option>
              <option value="size">{t.trackers.deals.size}</option>
            </select>
            <label className="flex items-center gap-2">
              {t.downloads.category}
              <select className="input w-auto" value={qbCategory} onChange={(e) => setQbCategory(e.target.value)}>
                <option value="">{t.downloads.noCategory}</option>
                {(qbitCategories.data ?? []).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <span className="ml-auto">{t.trackers.deals.count(rows.length)}</span>
          </div>
          {tracker && tracker.status !== "ok" ? (
            <div className="card">
              <Empty>{t.trackers.deals.failed(tracker.message ?? t.trackers.status[tracker.status])}</Empty>
            </div>
          ) : rows.length === 0 ? (
            <div className="card">
              <Empty>{t.trackers.deals.none}</Empty>
            </div>
          ) : (
            <ul className="card divide-y divide-border overflow-hidden">
              {rows.slice(0, shown).map((d) => (
                <DealRow
                  key={`${d.indexerId}:${d.id}`}
                  d={d}
                  sending={sending === `${d.indexerId}:${d.id}`}
                  onSend={() => void send(d)}
                />
              ))}
            </ul>
          )}
          {rows.length > shown && (
            <button type="button" className="btn-outline self-center" onClick={() => setShown((n) => n + PAGE)}>
              {t.trackers.deals.more(Math.min(PAGE, rows.length - shown))}
            </button>
          )}
        </>
      )}
    </section>
  );
}
