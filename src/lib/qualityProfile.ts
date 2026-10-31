import type { ProfileItem, QualityProfileFull } from "@/api/arrManage";

/** Id con el que el perfil se refiere a un elemento (el `cutoff`): el del grupo o el de la calidad. */
export function itemKey(item: ProfileItem): number {
  return item.quality ? item.quality.id : (item.id ?? -1);
}

export function itemName(item: ProfileItem): string {
  return item.quality?.name ?? item.name ?? "?";
}

/** Calidades que contiene un grupo (para enseñarlas debajo de su nombre). */
export function groupMembers(item: ProfileItem): string[] {
  return item.quality ? [] : item.items.map(itemName);
}

/** Elementos permitidos de mejor a peor, que son los que pueden ser el límite de mejora. */
export function allowedItems(p: Pick<QualityProfileFull, "items">): ProfileItem[] {
  return [...p.items].reverse().filter((i) => i.allowed);
}

/**
 * Marca o desmarca un elemento. Si el límite de mejora deja de estar permitido, pasa al mejor de los
 * que quedan (el *arr rechaza un límite no permitido).
 */
export function setAllowed<T extends QualityProfileFull>(p: T, key: number, allowed: boolean): T {
  const items = p.items.map((i) => (itemKey(i) === key ? { ...i, allowed, items: i.items.map((c) => ({ ...c, allowed })) } : i));
  const next = { ...p, items };
  const ok = allowedItems(next);
  if (!ok.some((i) => itemKey(i) === p.cutoff) && ok.length) next.cutoff = itemKey(ok[0]);
  return next;
}

/**
 * Sube (`-1`) o baja (`+1`) un elemento en la lista tal como se ve (de mejor a peor). En `items` el
 * orden es el contrario, así que «subir» lo acerca al final.
 */
export function moveItem<T extends QualityProfileFull>(p: T, key: number, dir: -1 | 1): T {
  const i = p.items.findIndex((x) => itemKey(x) === key);
  const j = i - dir;
  if (i < 0 || j < 0 || j >= p.items.length) return p;
  const items = [...p.items];
  [items[i], items[j]] = [items[j], items[i]];
  return { ...p, items };
}

export function setFormatScore<T extends QualityProfileFull>(p: T, formatId: number, score: number): T {
  return { ...p, formatItems: p.formatItems.map((f) => (f.format === formatId ? { ...f, score } : f)) };
}

export type ProfileProblem = "name" | "noneAllowed" | "cutoff";

/** Lo que el *arr rechazaría al guardar, para avisar antes. */
export function profileProblems(p: QualityProfileFull): ProfileProblem[] {
  const out: ProfileProblem[] = [];
  if (!p.name.trim()) out.push("name");
  const ok = allowedItems(p);
  if (!ok.length) out.push("noneAllowed");
  else if (!ok.some((i) => itemKey(i) === p.cutoff)) out.push("cutoff");
  return out;
}
