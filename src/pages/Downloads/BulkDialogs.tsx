import { useState } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/Dialog";
import { qbit, type Torrent } from "@/api/qbit";
import { t } from "@/i18n/es";
import { errorMessage } from "@/lib/errors";

const KIB = 1024;

function Actions({ busy, onCancel, onApply }: { busy: boolean; onCancel: () => void; onApply: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <button className="btn-ghost" onClick={onCancel}>
        {t.common.cancel}
      </button>
      <button className="btn-primary" disabled={busy} onClick={onApply}>
        {t.downloads.apply}
      </button>
    </div>
  );
}

async function apply(fn: () => Promise<unknown>, ok: string, done: () => void, setBusy: (b: boolean) => void) {
  setBusy(true);
  try {
    await fn();
    toast.success(ok);
    done();
  } catch (e) {
    toast.error(errorMessage(e, "qbittorrent"));
  } finally {
    setBusy(false);
  }
}

/** Cambiar la categoría de uno o varios torrents (vacía = sin categoría). */
export function CategoryDialog({
  torrents,
  categories,
  onDone,
  onClose,
}: {
  torrents: Torrent[];
  categories: string[];
  onDone: () => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState(torrents.length === 1 ? torrents[0].category : "");
  const [busy, setBusy] = useState(false);
  const hashes = torrents.map((x) => x.hash);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t.downloads.setCategoryTitle(torrents.length)}>
      <div className="flex flex-col gap-4">
        <label>
          <span className="label">{t.downloads.category}</span>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t.downloads.noCategory}</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <Actions
          busy={busy}
          onCancel={onClose}
          onApply={() =>
            apply(
              () => qbit.setCategory(hashes, category),
              t.downloads.categoryChanged,
              () => (onDone(), onClose()),
              setBusy,
            )
          }
        />
      </div>
    </Dialog>
  );
}

const toKib = (bytes?: number) => (bytes && bytes > 0 ? String(Math.round(bytes / KIB)) : "0");

/** Límite de bajada y subida de uno o varios torrents, en KiB/s como en qBittorrent (0 = sin límite). */
export function LimitsDialog({ torrents, onDone, onClose }: { torrents: Torrent[]; onDone: () => void; onClose: () => void }) {
  const one = torrents.length === 1 ? torrents[0] : undefined;
  const [dl, setDl] = useState(toKib(one?.dl_limit));
  const [up, setUp] = useState(toKib(one?.up_limit));
  const [busy, setBusy] = useState(false);
  const hashes = torrents.map((x) => x.hash);
  const bytes = (v: string) => Math.max(0, Math.round(Number(v) || 0)) * KIB;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t.downloads.setLimitsTitle(torrents.length)}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">{t.downloads.dlLimit}</span>
            <input className="input" type="number" min={0} value={dl} onChange={(e) => setDl(e.target.value)} />
          </label>
          <label>
            <span className="label">{t.downloads.upLimit}</span>
            <input className="input" type="number" min={0} value={up} onChange={(e) => setUp(e.target.value)} />
          </label>
        </div>
        <p className="text-xs text-muted">{t.downloads.limitHint}</p>
        <Actions
          busy={busy}
          onCancel={onClose}
          onApply={() =>
            apply(
              () => Promise.all([qbit.setDownloadLimit(hashes, bytes(dl)), qbit.setUploadLimit(hashes, bytes(up))]),
              t.downloads.limitsChanged,
              () => (onDone(), onClose()),
              setBusy,
            )
          }
        />
      </div>
    </Dialog>
  );
}
