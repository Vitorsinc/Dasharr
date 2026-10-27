import { useState } from "react";
import { ArrowDownWideNarrow, ExternalLink, Search as SearchIcon, Send } from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/Page";
import { ErrorPanel, NotConfigured } from "@/components/ErrorPanel";
import { Empty, Loading, Segmented, Spinner } from "@/components/ui";
import { t } from "@/i18n/es";
import { prowlarr, sortResults, torrentLink, type ResultSort, type SearchCategory, type SearchResult } from "@/api/prowlarr";
import { qbit } from "@/api/qbit";
import { useServiceQuery, REFRESH } from "@/hooks/useServiceQuery";
import { useCategories } from "@/hooks/useTorrents";
import { errorMessage } from "@/lib/errors";
import { formatAge, formatBytes } from "@/lib/format";
import { cn } from "@/lib/cn";

export default function SearchPage() {
  const indexers = useServiceQuery("prowlarr", ["indexers"], prowlarr.getIndexers, { staleTime: REFRESH.library });
  const qbitCategories = useCategories();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SearchCategory>("all");
  const [indexerId, setIndexerId] = useState<number | "">("");
  const [qbCategory, setQbCategory] = useState("");
  const [sort, setSort] = useState<ResultSort>("seeders");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sending, setSending] = useState<string | null>(null);

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      setResults(await prowlarr.search(query.trim(), category, indexerId === "" ? [] : [indexerId]));
    } catch (err) {
      setError(err);
      setResults(null);
    } finally {
      setSearching(false);
    }
  }

  async function send(r: SearchResult) {
    const link = torrentLink(r);
    if (!link) return;
    setSending(r.guid);
    try {
      await qbit.addUrls([link], qbCategory || undefined);
      toast.success(t.search.sent);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(null);
    }
  }

  if (indexers.configured === false) return <Page title={t.nav.search}><NotConfigured service="prowlarr" /></Page>;

  const sorted = results ? sortResults(results, sort) : [];
  return (
    <Page title={t.nav.search}>
      <form onSubmit={run} className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-72 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input autoFocus className="input py-2.5 pl-9 text-base" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search.placeholder} aria-label={t.search.placeholder} />
        </div>
        <Segmented<SearchCategory>
          label={t.search.category}
          value={category}
          onChange={setCategory}
          options={[
            { value: "all", label: t.search.catAll },
            { value: "movies", label: t.search.catMovies },
            { value: "tv", label: t.search.catTv },
          ]}
        />
        <select className="input w-auto" value={indexerId} onChange={(e) => setIndexerId(e.target.value ? Number(e.target.value) : "")} aria-label={t.search.indexers}>
          <option value="">{t.search.allIndexers}</option>
          {(indexers.data ?? []).filter((i) => i.enable).map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        <button className="btn-primary" type="submit" disabled={searching || !query.trim()}>
          {searching && <Spinner className="h-4 w-4 text-white" />}
          {t.common.search}
        </button>
      </form>

      {error ? (
        <ErrorPanel service="prowlarr" error={error} onRetry={() => run()} />
      ) : searching ? (
        <Loading />
      ) : results === null ? (
        <Empty>{t.search.hint}</Empty>
      ) : results.length === 0 ? (
        <Empty />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
            <span>{t.search.results(results.length)}</span>
            <label className="ml-auto flex items-center gap-2">
              <ArrowDownWideNarrow className="h-4 w-4" />
              <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as ResultSort)} aria-label="Ordenar resultados">
                <option value="seeders">{t.search.seeders}</option>
                <option value="size">{t.search.size}</option>
                <option value="age">{t.search.age}</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              {t.downloads.category}
              <select className="input w-auto" value={qbCategory} onChange={(e) => setQbCategory(e.target.value)}>
                <option value="">{t.downloads.noCategory}</option>
                {(qbitCategories.data ?? []).map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">{t.search.title}</th>
                  <th className="w-36 px-3 py-2 font-medium">{t.search.indexer}</th>
                  <th className="w-24 px-3 py-2 font-medium">{t.search.size}</th>
                  <th className="w-24 px-3 py-2 font-medium">{t.search.seeders}</th>
                  <th className="w-20 px-3 py-2 font-medium">{t.search.age}</th>
                  <th className="w-24 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const link = torrentLink(r);
                  return (
                    <tr key={r.guid} className="border-b border-border last:border-0 hover:bg-surface-2/60">
                      <td className="max-w-0 px-4 py-2.5"><div className="truncate" title={r.title}>{r.title}</div></td>
                      <td className="truncate px-3 py-2.5 text-muted">{r.indexer}</td>
                      <td className="px-3 py-2.5 tabular-nums text-muted">{formatBytes(r.size)}</td>
                      <td className="px-3 py-2.5 tabular-nums">
                        <span className={cn((r.seeders ?? 0) > 10 ? "text-success" : (r.seeders ?? 0) > 0 ? "text-warning" : "text-danger")}>{r.seeders ?? "—"}</span>
                        <span className="text-muted"> / {r.leechers ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-muted">{formatAge(r.publishDate)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-0.5">
                          {r.infoUrl && (
                            <a className="btn-ghost p-1.5" href={r.infoUrl} target="_blank" rel="noreferrer" aria-label="Ver en el indexador"><ExternalLink className="h-4 w-4" /></a>
                          )}
                          <button className="btn-ghost p-1.5 text-accent" disabled={!link || sending === r.guid} onClick={() => send(r)} aria-label={`${t.search.send}: ${r.title}`} title={link ? t.search.send : t.search.usenet}>
                            {sending === r.guid ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Page>
  );
}
