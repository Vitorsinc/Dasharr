import { invoke } from "@tauri-apps/api/core";

/** Idiomas de subtítulos que indica la página de Nyaa (vacío si no dice nada); `null` si no es de Nyaa. */
export const nyaaSubtitles = async (url: string) => (await invoke<string[] | null>("nyaa_subtitles", { url })) ?? null;
