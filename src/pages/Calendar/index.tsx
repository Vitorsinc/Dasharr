import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Page } from "@/components/Page";
import { ErrorPanel, NotConfigured } from "@/components/ErrorPanel";
import { Loading, Segmented } from "@/components/ui";
import { t } from "@/i18n/es";
import type { CalItem } from "@/api/calendar";
import { useCalendar } from "@/hooks/useCalendar";
import { addDays, dayKey, sameDay, startOfMonth, startOfWeek } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { MovieDetail } from "@/pages/Movies/MovieDetail";
import { SeriesDetail } from "@/pages/Series/SeriesDetail";

type View = "week" | "month";

const monthFmt = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" });
const dayFmt = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });

export function CalendarChip({ item, onClick, compact }: { item: CalItem; onClick: () => void; compact?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={`${item.title} · ${item.subtitle}`}
      className={cn(
        "w-full rounded-md border-l-2 px-2 py-1 text-left text-xs transition-colors hover:brightness-110",
        item.source === "radarr" ? "border-warning bg-warning/10" : "border-accent bg-accent/10",
        item.hasFile && "opacity-60",
      )}
    >
      <div className="truncate font-medium">{item.title}</div>
      {!compact && <div className="truncate text-muted">{item.subtitle}</div>}
    </button>
  );
}

export function useItemDetail() {
  const [open, setOpen] = useState<CalItem | null>(null);
  const dialogs = (
    <>
      <MovieDetail movie={open?.movie ?? null} onClose={() => setOpen(null)} />
      <SeriesDetail series={open?.episode?.series ?? null} onClose={() => setOpen(null)} />
    </>
  );
  return { openItem: setOpen, dialogs };
}

export default function CalendarPage() {
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const { start, days } = useMemo(() => {
    if (view === "week") {
      const s = startOfWeek(anchor);
      return { start: s, days: Array.from({ length: 7 }, (_, i) => addDays(s, i)) };
    }
    const s = startOfWeek(startOfMonth(anchor));
    return { start: s, days: Array.from({ length: 42 }, (_, i) => addDays(s, i)) };
  }, [view, anchor]);
  const end = addDays(days[days.length - 1], 1);
  const cal = useCalendar(start, end);
  const { openItem, dialogs } = useItemDetail();
  const byDay = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    for (const it of cal.items) m.set(dayKey(it.date), [...(m.get(dayKey(it.date)) ?? []), it]);
    return m;
  }, [cal.items]);
  const today = new Date();
  const move = (dir: number) =>
    setAnchor((a) => (view === "week" ? addDays(a, 7 * dir) : new Date(a.getFullYear(), a.getMonth() + dir, 1)));
  const title = view === "week" ? `${dayFmt.format(days[0])} – ${dayFmt.format(days[6])}` : monthFmt.format(anchor);

  if (cal.noneConfigured)
    return (
      <Page title={t.nav.calendar}>
        <NotConfigured service="radarr" />
      </Page>
    );

  return (
    <Page
      title={t.nav.calendar}
      actions={
        <>
          <div className="flex items-center gap-1">
            <button className="btn-ghost p-2" onClick={() => move(-1)} aria-label={t.calendar.previous}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button className="btn-outline" onClick={() => setAnchor(new Date())}>
              {t.calendar.today}
            </button>
            <button className="btn-ghost p-2" onClick={() => move(1)} aria-label={t.calendar.next}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <span className="min-w-40 text-center text-sm font-medium capitalize">{title}</span>
          <Segmented<View>
            value={view}
            onChange={setView}
            options={[
              { value: "week", label: t.calendar.week },
              { value: "month", label: t.calendar.month },
            ]}
          />
        </>
      }
    >
      {cal.errors.map((e) => (
        <ErrorPanel key={e.service} service={e.service} error={e.error} onRetry={cal.refetch} compact />
      ))}
      {cal.isLoading ? (
        <Loading />
      ) : (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border text-center text-xs font-medium text-muted">
            {t.calendar.weekdays.map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          <div className={cn("grid grid-cols-7", view === "month" && "auto-rows-[minmax(110px,auto)]")}>
            {days.map((d) => {
              const items = byDay.get(dayKey(d)) ?? [];
              const outside = view === "month" && d.getMonth() !== anchor.getMonth();
              return (
                <div
                  key={dayKey(d)}
                  data-testid={`day-${dayKey(d)}`}
                  className={cn(
                    "flex flex-col gap-1 border-b border-r border-border p-1.5 [&:nth-child(7n)]:border-r-0",
                    view === "week" && "min-h-[60vh]",
                    outside && "bg-surface-2/40",
                  )}
                >
                  <div
                    className={cn(
                      "mb-1 self-end rounded-full px-1.5 text-xs tabular-nums",
                      sameDay(d, today) ? "bg-accent text-white" : outside ? "text-muted/60" : "text-muted",
                    )}
                  >
                    {d.getDate()}
                  </div>
                  {items.map((it) => (
                    <CalendarChip key={it.id} item={it} compact={view === "month"} onClick={() => openItem(it)} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {dialogs}
    </Page>
  );
}
