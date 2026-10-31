import { useState } from "react";
import { Check, Clapperboard, Tv } from "lucide-react";
import type { CalItem } from "@/api/calendar";
import { dayKey, sameDay, startOfDay } from "@/lib/dates";
import { cn } from "@/lib/cn";

const weekdayLong = new Intl.DateTimeFormat("es-ES", { weekday: "long" });
const weekdayShort = new Intl.DateTimeFormat("es-ES", { weekday: "short" });
const longDate = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" });

type Props = { days: Date[]; byDay: Map<string, CalItem[]>; onOpen: (it: CalItem) => void };

/** Hora de emisión en episodios; en películas, el tipo de estreno (no tienen hora). */
function when(it: CalItem) {
  if (it.source === "sonarr") return timeFmt.format(it.date);
  return it.subtitle.split(" · ")[0];
}
function sub(it: CalItem) {
  return it.source === "sonarr" ? it.subtitle : it.subtitle.split(" · ")[1];
}
function isPast(d: Date, today: Date) {
  return startOfDay(d) < startOfDay(today);
}

function Status({ it, today }: { it: CalItem; today: Date }) {
  if (it.hasFile)
    return (
      <span className="chip bg-success/15 text-success">
        <Check className="h-3 w-3" /> Descargado
      </span>
    );
  if (it.date < today) return <span className="chip bg-warning/15 text-warning">Falta</span>;
  return null;
}

function Img({ src, className }: { src?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className={cn("bg-surface-2", className)} />;
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className={cn("object-cover", className)} />;
}

/* ───────────── A · Agenda: una fila por día, con los estrenos en lista ───────────── */
export function WeekAgenda({ days, byDay, onOpen }: Props) {
  const today = new Date();
  return (
    <div className="card divide-y divide-border overflow-hidden">
      {days.map((d) => {
        const items = byDay.get(dayKey(d)) ?? [];
        const isToday = sameDay(d, today);
        const past = isPast(d, today);
        return (
          <section key={dayKey(d)} className={cn("relative grid grid-cols-[96px_1fr]", isToday && "bg-accent/[0.06]")}>
            {isToday && <div className="absolute inset-y-0 left-0 w-1 bg-accent" />}
            <div className={cn("flex flex-col items-start px-5 py-3", past && "opacity-45")}>
              <span className={cn("text-xs capitalize", isToday ? "font-semibold text-accent" : "text-muted")}>
                {isToday ? "Hoy" : weekdayLong.format(d)}
              </span>
              <span className="font-display text-3xl font-extrabold leading-none tabular-nums [font-stretch:78%]">
                {d.getDate()}
              </span>
            </div>
            {items.length === 0 ? (
              <div className="flex items-center py-3 text-sm text-muted/70">Sin estrenos</div>
            ) : (
              <ul className="divide-y divide-border/60 py-1 pr-3">
                {items.map((it) => (
                  <li key={it.id}>
                    <button
                      onClick={() => onOpen(it)}
                      className={cn(
                        "grid w-full grid-cols-[36px_72px_1fr_auto] items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-2",
                        past && !isToday && "opacity-70",
                      )}
                    >
                      <Img src={it.poster} className="h-[54px] w-9 rounded" />
                      <span className="flex items-center gap-1.5 text-sm tabular-nums">
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", it.source === "radarr" ? "bg-radarr" : "bg-sonarr")} />
                        {when(it)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{it.title}</span>
                        <span className="block truncate text-sm text-muted">{sub(it)}</span>
                      </span>
                      <Status it={it} today={today} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ───────────── B · Pósters: siete columnas con carteles a la altura de su contenido ───────────── */
export function WeekPosters({ days, byDay, onOpen }: Props) {
  const today = new Date();
  return (
    <div className="grid grid-cols-7 gap-3">
      {days.map((d) => {
        const items = byDay.get(dayKey(d)) ?? [];
        const isToday = sameDay(d, today);
        const past = isPast(d, today);
        return (
          <div
            key={dayKey(d)}
            className={cn("flex flex-col gap-2 rounded-xl p-2", isToday ? "bg-accent/10 ring-1 ring-accent/40" : "bg-surface/60")}
          >
            <div className={cn("flex items-baseline justify-between px-1", past && "opacity-45")}>
              <span className={cn("text-sm capitalize", isToday ? "font-semibold text-accent" : "text-muted")}>
                {isToday ? "Hoy" : weekdayShort.format(d).replace(".", "")}
              </span>
              <span
                className={cn(
                  "font-display text-2xl font-extrabold tabular-nums [font-stretch:78%]",
                  isToday && "text-accent",
                )}
              >
                {d.getDate()}
              </span>
            </div>
            {items.length === 0 && <div className="px-1 py-6 text-center text-xs text-muted/70">Sin estrenos</div>}
            {items.map((it) => (
              <button
                key={it.id}
                onClick={() => onOpen(it)}
                title={`${it.title} · ${it.subtitle}`}
                className={cn(
                  "group relative overflow-hidden rounded-lg text-left text-white",
                  past && !isToday && !it.hasFile && "opacity-80",
                )}
              >
                <Img src={it.poster} className="aspect-[2/3] w-full transition-transform duration-300 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                <span
                  className={cn(
                    "absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                    it.source === "radarr" ? "bg-radarr text-black" : "bg-sonarr text-black",
                  )}
                >
                  {when(it)}
                </span>
                {it.hasFile && (
                  <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-success text-black">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 p-2">
                  <div className="truncate text-sm font-semibold leading-tight">{it.title}</div>
                  <div className="truncate text-xs text-white/70">{sub(it)}</div>
                </div>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ───────────── C · Tira de días + detalle del día elegido ───────────── */
export function WeekStrip({ days, byDay, onOpen }: Props) {
  const today = new Date();
  const initial = days.find((d) => sameDay(d, today)) ?? days[0];
  const [sel, setSel] = useState(dayKey(initial));
  const selDate = days.find((d) => dayKey(d) === sel) ?? days[0];
  const items = byDay.get(sel) ?? [];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => {
          const its = byDay.get(dayKey(d)) ?? [];
          const isToday = sameDay(d, today);
          const active = dayKey(d) === sel;
          return (
            <button
              key={dayKey(d)}
              onClick={() => setSel(dayKey(d))}
              className={cn(
                "flex flex-col gap-2 rounded-xl border p-3 text-left transition-colors",
                active ? "border-accent bg-accent/10" : "border-border bg-surface hover:bg-surface-2",
                isPast(d, today) && !active && "opacity-55",
              )}
            >
              <div className="flex items-baseline justify-between">
                <span className={cn("text-sm capitalize", isToday ? "font-semibold text-accent" : "text-muted")}>
                  {isToday ? "Hoy" : weekdayShort.format(d).replace(".", "")}
                </span>
                <span className="font-display text-2xl font-extrabold tabular-nums [font-stretch:78%]">{d.getDate()}</span>
              </div>
              <div className="flex h-12 items-end -space-x-3">
                {its.slice(0, 4).map((it) => (
                  <Img key={it.id} src={it.poster} className="h-12 w-8 rounded border-2 border-surface shadow" />
                ))}
                {its.length === 0 && <span className="text-xs text-muted/70">Nada</span>}
              </div>
              <div className="flex gap-2 text-xs text-muted">
                {its.some((i) => i.source === "radarr") && (
                  <span className="flex items-center gap-1">
                    <Clapperboard className="h-3 w-3 text-radarr" />
                    {its.filter((i) => i.source === "radarr").length}
                  </span>
                )}
                {its.some((i) => i.source === "sonarr") && (
                  <span className="flex items-center gap-1">
                    <Tv className="h-3 w-3 text-sonarr" />
                    {its.filter((i) => i.source === "sonarr").length}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <div>
        <h2 className="mb-3 text-2xl first-letter:uppercase">
          {sameDay(selDate, today) ? `Hoy, ${longDate.format(selDate).split(", ")[1]}` : longDate.format(selDate)}
        </h2>
        {items.length === 0 ? (
          <div className="card p-8 text-center text-muted">Nada programado este día.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {items.map((it) => (
              <button
                key={it.id}
                onClick={() => onOpen(it)}
                className="group relative flex h-36 overflow-hidden rounded-xl bg-black text-left text-white"
              >
                <Img src={it.backdrop} className="absolute inset-0 h-full w-full opacity-80 transition-transform duration-300 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/10" />
                <div className="relative flex w-full gap-4 p-3">
                  <Img src={it.poster} className="h-full w-20 shrink-0 rounded-md shadow-lg" />
                  <div className="flex min-w-0 flex-1 flex-col justify-between py-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className={cn("font-semibold tabular-nums", it.source === "radarr" ? "text-radarr" : "text-sonarr")}>
                        {when(it)}
                      </span>
                      <span className="text-white/60">{it.source === "radarr" ? "Película" : "Episodio"}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-display text-xl font-bold [font-stretch:78%]">{it.title}</div>
                      <div className="truncate text-sm text-white/75">{sub(it)}</div>
                    </div>
                    <div>
                      <Status it={it} today={today} />
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
