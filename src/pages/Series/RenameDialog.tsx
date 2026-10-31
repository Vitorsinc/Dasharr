import { RenameDialog as ArrRenameDialog } from "@/components/media/RenameDialog";
import { sonarr, type Series } from "@/api/sonarr";
import { t } from "@/i18n/es";

/** Renombrar los episodios de una serie según el formato de Sonarr, con vista previa. */
export function RenameDialog({ series, onClose }: { series: Series; onClose: () => void }) {
  return (
    <ArrRenameDialog
      service="sonarr"
      title={t.seriesTools.renameTitle(series.title)}
      queryKey={[series.id]}
      load={async () =>
        (await sonarr.getRenamePreview(series.id)).map((r) => ({ fileId: r.episodeFileId, existingPath: r.existingPath, newPath: r.newPath }))
      }
      onRename={(files) => sonarr.renameFiles(series.id, files)}
      onClose={onClose}
    />
  );
}
