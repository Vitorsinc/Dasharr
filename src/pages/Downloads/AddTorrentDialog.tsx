import { useState } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/Dialog";
import { Spinner } from "@/components/ui";
import { t } from "@/i18n/es";
import { qbit } from "@/api/qbit";
import { errorMessage } from "@/lib/errors";

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function AddTorrentDialog({ open, onOpenChange, categories, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; categories: string[]; onAdded: () => void }) {
  const [urls, setUrls] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const list = urls.split("\n").map((u) => u.trim()).filter(Boolean);
      if (list.length) await qbit.addUrls(list, category || undefined);
      if (file) await qbit.addFile({ field: "torrents", filename: file.name, base64: await readBase64(file) }, category || undefined);
      toast.success(t.downloads.added);
      setUrls("");
      setFile(null);
      onAdded();
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t.downloads.addTitle}>
      <div className="flex flex-col gap-4">
        <label>
          <span className="label">{t.downloads.urls}</span>
          <textarea className="input min-h-24 font-mono text-xs" value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="magnet:?xt=urn:btih:…" />
        </label>
        <label>
          <span className="label">{t.downloads.file}</span>
          <input type="file" accept=".torrent,application/x-bittorrent" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <label>
          <span className="label">{t.downloads.category}</span>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t.downloads.noCategory}</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </button>
          <button className="btn-primary" disabled={busy || (!urls.trim() && !file)} onClick={submit}>
            {busy && <Spinner className="h-4 w-4 text-white" />}
            {t.common.add}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
