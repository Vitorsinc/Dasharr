/**
 * Proveedores de subtítulos que conoce Bazarr, con los campos que pide cada uno.
 *
 * Bazarr no expone esta lista por la API (vive en su interfaz web: frontend/src/pages/Settings/Providers/list.tsx),
 * así que se copia aquí. Los valores se guardan en `settings-<proveedor>-<campo>`. Un proveedor activo que no esté
 * en la lista (Bazarr más nuevo) se enseña igual, con los campos que devuelva Bazarr en sus ajustes.
 */

export type CatalogFieldType = "text" | "password" | "switch" | "number" | "select" | "list";

export interface CatalogField {
  key: string;
  type: CatalogFieldType;
  label?: string;
  help?: string;
  default?: string | number | boolean | string[];
  options?: { value: string; label: string }[];
  /** Devuelve el motivo si el valor no vale. */
  validate?: (value: string) => string | null;
}

export interface CatalogProvider {
  key: string;
  name: string;
  description?: string;
  /** Aviso que Bazarr enseña al configurarlo. */
  note?: string;
  /** Necesita la integración con AniDB configurada en Bazarr. */
  anidb?: boolean;
  fields?: CatalogField[];
}

const user: CatalogField = { key: "username", type: "text" };
const pass: CatalogField = { key: "password", type: "password" };
const cookies: CatalogField = { key: "cookies", type: "text", help: "Copia el valor entero desde tu navegador, p. ej. PHPSESSID=abc; usuario=xyz" };
const agent: CatalogField = { key: "user_agent", type: "text", help: "El del navegador del que copiaste las cookies, p. ej. Mozilla/5.0 (Windows NT 10.0; Win64; x64)…" };
const login = [user, pass];

const LOG_LEVELS = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"].map((v) => ({ value: v, label: v }));

export const BAZARR_PROVIDERS: CatalogProvider[] = [
  {
    key: "addic7ed",
    name: "Addic7ed",
    description: "Necesita un servicio anti-captcha o cookies.",
    fields: [...login, cookies, agent, { key: "vip", type: "switch", label: "VIP" }],
  },
  { key: "animekalesi", name: "AnimeKalesi", description: "Anime en turco." },
  {
    key: "animetosho",
    name: "Anime Tosho",
    description: "Espejo automático de los torrents de anime de TokyoTosho, Nyaa y AniDex.",
    anidb: true,
    fields: [
      {
        key: "search_threshold",
        type: "number",
        label: "Umbral de búsqueda",
        default: 6,
        help: "Súbelo si no encuentra subtítulos de tu anime; cuanto más alto, más lenta es cada búsqueda.",
      },
    ],
  },
  { key: "animetosho_xyz", name: "AnimeTosho.xyz", description: "Espejo automático de torrents de anime.", anidb: true },
  { key: "tsukihime", name: "TsukiHime", description: "Pistas de subtítulos sacadas de los releases de anime de TsukiHime.", anidb: true },
  { key: "animesubinfo", name: "AnimeSub.info", description: "Anime en polaco." },
  { key: "avistaz", name: "AvistaZ", description: "Tracker privado asiático (películas y series).", fields: [cookies, agent] },
  { key: "bayflix", name: "Bayflix", description: "Subtítulos en búlgaro." },
  { key: "assrt", name: "Assrt", description: "Subtítulos en chino.", fields: [{ key: "token", type: "text", label: "Token" }] },
  {
    key: "betaseries",
    name: "BetaSeries",
    description: "Francés e inglés, solo series.",
    fields: [{ key: "token", type: "text", label: "API key" }],
  },
  { key: "bsplayer", name: "BSplayer", description: "Retirado de Bazarr: nunca devuelve subtítulos." },
  { key: "cinemaz", name: "CinemaZ", description: "Tracker privado de cine de culto y poco conocido.", fields: [cookies, agent] },
  {
    key: "embeddedsubtitles",
    name: "Subtítulos incrustados",
    description: "Saca los subtítulos que ya lleva dentro el vídeo. Desactiva «Treat Embedded Subtitles as Downloaded» en Bazarr → Settings → Subtitles para que funcione.",
    note: "Si los vídeos están en la nube, tiene que leer el archivo entero.",
    fields: [
      { key: "included_codecs", type: "list", label: "Códecs permitidos", help: "subrip, ass, webvtt, mov_text, separados por comas. Vacío = todos.", default: [] },
      { key: "timeout", type: "number", label: "Tiempo máximo de extracción (segundos)", default: 600 },
      { key: "hi_fallback", type: "switch", label: "Usar subtítulos SDH si no hay otros", help: "No lo actives si tu perfil de idiomas ya pide SDH." },
      { key: "unknown_as_fallback", type: "switch", label: "Usar los de idioma desconocido como idioma de reserva" },
      { key: "fallback_lang", type: "text", label: "Idioma de reserva", default: "en" },
    ],
  },
  { key: "gestdown", name: "Gestdown (proxy de Addic7ed)", description: "Addic7ed sin usuario ni cookies." },
  { key: "greeksubs", name: "GreekSubs", description: "Subtítulos en griego." },
  { key: "greeksubtitles", name: "GreekSubtitles", description: "Subtítulos en griego." },
  {
    key: "hdbits",
    name: "HDBits.org",
    description: "Tracker privado.",
    note: "Necesitas la verificación en dos pasos activada y la IP del servidor en la lista blanca.",
    fields: [user, { key: "passkey", type: "password", label: "Passkey de tu perfil" }],
  },
  {
    key: "jimaku",
    name: "Jimaku.cc",
    description: "Subtítulos en japonés.",
    note: "Los subtítulos vienen de varias fuentes y pueden tener fallos de calidad o de sincronía.",
    anidb: true,
    fields: [
      { key: "api_key", type: "password", label: "API key" },
      { key: "enable_name_search_fallback", type: "switch", label: "Buscar por nombre si no hay ID de AniList", help: "Menos preciso; hace falta para acción real." },
      { key: "enable_archives_download", type: "switch", label: "Tener en cuenta también archivos comprimidos" },
      { key: "enable_ai_subs", type: "switch", label: "Descargar subtítulos generados por IA" },
    ],
  },
  { key: "hosszupuska", name: "Hosszupuska", description: "Subtítulos en húngaro." },
  {
    key: "karagarga",
    name: "Karagarga.in",
    description: "Películas (tracker privado).",
    fields: [...login, { key: "f_username", type: "text", label: "Usuario del foro" }, { key: "f_password", type: "password", label: "Contraseña del foro" }],
  },
  {
    key: "ktuvit",
    name: "Ktuvit",
    description: "Subtítulos en hebreo.",
    fields: [{ key: "email", type: "text", label: "Correo" }, { key: "hashed_password", type: "text", label: "Contraseña cifrada (hash)" }],
  },
  { key: "pipocas", name: "Pipocas.tv", description: "Portugués, brasileño, inglés y español.", fields: login },
  {
    key: "legendasdivx",
    name: "LegendasDivx",
    description: "Brasileño y portugués.",
    fields: [...login, { key: "skip_wrong_fps", type: "switch", label: "Saltar los de FPS distintos" }],
  },
  { key: "legendasnet", name: "Legendas.net", description: "Subtítulos en brasileño.", fields: login },
  {
    key: "napiprojekt",
    name: "NapiProjekt",
    description: "Subtítulos en polaco.",
    note: "La búsqueda solo por hash es un apaño temporal: encuentra menos y no tiene en cuenta los filtros de autor.",
    fields: [
      { key: "hash_only", type: "switch", label: "Buscar solo por hash" },
      { key: "only_authors", type: "switch", label: "Saltar los que no tienen autor o pueden ser de IA" },
      { key: "only_real_names", type: "switch", label: "Solo autores con nombre real" },
    ],
  },
  {
    key: "napisy24",
    name: "Napisy24",
    description: "Subtítulos en polaco.",
    note: "La cuenta tiene que tener acceso a la API. Déjalo vacío para usar la de por defecto.",
    fields: login,
  },
  { key: "nekur", name: "Nekur", description: "Subtítulos en letón." },
  {
    key: "opensubtitlescom",
    name: "OpenSubtitles.com",
    description: "El más grande, en muchos idiomas. Cuenta gratuita con límite diario de descargas.",
    fields: [
      {
        key: "username",
        type: "text",
        help: "El nombre de usuario, no el correo.",
        validate: (v) => (/^.\S+@\S+$/.test(v) ? "Usa tu nombre de usuario, no el correo." : null),
      },
      pass,
      { key: "use_hash", type: "switch", label: "Usar el hash del archivo" },
      { key: "include_ai_translated", type: "switch", label: "Incluir los traducidos por la IA de OpenSubtitles" },
      { key: "include_machine_translated", type: "switch", label: "Incluir los traducidos automáticamente por usuarios" },
    ],
  },
  { key: "prijevodionline", name: "Prijevodi Online", description: "Sin usuario ni cookies." },
  { key: "regielive", name: "RegieLive", description: "Subtítulos en rumano." },
  { key: "soustitreseu", name: "Sous-Titres.eu", description: "Sobre todo en francés." },
  { key: "subclub", name: "SubClub.eu", description: "Subtítulos en estonio." },
  {
    key: "subdl",
    name: "SubDL",
    description: "Muchos idiomas, con API key gratuita.",
    note: "Todo funciona con la API key gratuita salvo la traducción con IA, que necesita SubDL Plus o Pro.",
    fields: [
      { key: "api_key", type: "password", label: "API key" },
      { key: "ai_translate", type: "switch", label: "Traducir con IA los idiomas que falten (SubDL Plus o Pro)", default: false },
      { key: "include_ai_translated", type: "switch", label: "Incluir subtítulos traducidos con IA", default: false },
    ],
  },
  {
    key: "subf2m",
    name: "subf2m.co",
    note: "Usa un User-Agent propio y creíble.",
    fields: [{ key: "verify_ssl", type: "switch", label: "Comprobar el certificado SSL", default: true }, { ...agent, help: undefined }],
  },
  {
    key: "subsource",
    name: "subsource.net",
    note: "Crea tu API key en tu perfil de Subsource.",
    fields: [{ key: "apikey", type: "password", label: "API key" }],
  },
  {
    key: "subsarr",
    name: "Subsarr",
    description: "Subscene en tu propio servidor (slimcdk/subsarr).",
    fields: [{ key: "base_url", type: "text", label: "URL base" }],
  },
  {
    key: "subsdump",
    name: "SubsDump",
    description: "Tu propio archivo de Subscene con SubsDump.",
    fields: [{ key: "base_url", type: "text", label: "URL base" }, { key: "api_key", type: "password", label: "API key (opcional)" }],
  },
  { key: "subssabbz", name: "Subs.sab.bz", description: "Subtítulos en búlgaro." },
  { key: "subs4free", name: "Subs4Free", description: "Griego. Puede no funcionar." },
  { key: "subs4series", name: "Subs4Series", description: "Griego. Necesita anti-captcha en cada descarga." },
  { key: "subscenter", name: "Subscenter", description: "Subtítulos en hebreo." },
  {
    key: "subsro",
    name: "Subs.ro",
    description: "Subtítulos en rumano.",
    note: "Consigue la API key en https://subs.ro/api",
    fields: [{ key: "api_key", type: "text", label: "API key" }],
  },
  { key: "subsunacs", name: "Subsunacs.net", description: "Subtítulos en búlgaro." },
  { key: "subsynchro", name: "Subsynchro", description: "Subtítulos en francés." },
  { key: "subtis", name: "Subtis", description: "Español, solo películas. No hay que configurar nada." },
  { key: "subtitrarinoi", name: "Subtitrari-noi.ro", description: "Subtítulos en rumano." },
  { key: "subtitriid", name: "subtitri.id.lv", description: "Subtítulos en letón." },
  { key: "subtitulamostv", name: "Subtitulamos.tv", description: "Subtítulos en español." },
  {
    key: "subx",
    name: "SubX",
    description: "API de Subdivx: español de España y latino.",
    note: "Consigue la API key en https://subx-api.duckdns.org/",
    fields: [{ key: "api_key", type: "text", label: "API key" }],
  },
  {
    key: "subtitlecat",
    name: "Subtitle Cat",
    description: "Muchos idiomas.",
    fields: [{ key: "include_machine_translated", type: "switch", label: "Incluir los traducidos automáticamente por SubtitleCat" }],
  },
  { key: "supersubtitles", name: "SuperSubtitles", description: "Subtítulos en húngaro." },
  { key: "titlovi", name: "Titlovi", description: "Croata, serbio, bosnio y esloveno.", fields: login },
  { key: "titrari", name: "Titrari.ro", description: "Sobre todo en rumano." },
  {
    key: "titulky",
    name: "Titulky.com",
    description: "Checo y eslovaco. Solo con cuenta VIP.",
    fields: [
      ...login,
      { key: "approved_only", type: "switch", label: "Saltar los no aprobados" },
      { key: "skip_wrong_fps", type: "switch", label: "Saltar los de FPS distintos al vídeo" },
    ],
  },
  {
    key: "turkcealtyaziorg",
    name: "Turkcealtyazi.org",
    description: "Subtítulos en turco.",
    note: "Desde fuera de Turquía necesita cookies (sobre todo cf_clearance) y User-Agent.",
    fields: [cookies, agent],
  },
  { key: "tvsubtitles", name: "TVSubtitles", description: "Series en varios idiomas." },
  {
    key: "whisperai",
    name: "Whisper",
    description: "Genera los subtítulos con IA (Whisper) a partir del audio.",
    fields: [
      { key: "endpoint", type: "text", label: "Dirección de Whisper ASR", default: "http://127.0.0.1:9000" },
      { key: "response", type: "number", label: "Tiempo de conexión/respuesta (segundos)", default: 5 },
      { key: "timeout", type: "number", label: "Tiempo máximo de transcripción (segundos)", default: 3600 },
      { key: "loglevel", type: "select", label: "Nivel de registro", options: LOG_LEVELS },
      { key: "pass_video_name", type: "switch", label: "Pasar el nombre del vídeo a Whisper (para el registro)", default: false },
    ],
  },
  { key: "wizdom", name: "Wizdom", description: "Subtítulos en hebreo." },
  { key: "xsubs", name: "XSubs", description: "Subtítulos en griego.", fields: login },
  { key: "yavkanet", name: "Yavka.net", description: "Subtítulos en búlgaro." },
  { key: "yifysubtitles", name: "YIFY Subtitles", description: "Películas en muchos idiomas." },
  { key: "vladoonmooo", name: "Vladoon Mooo", description: "Subtítulos en búlgaro." },
  { key: "zimuku", name: "Zimuku", description: "Chino. Necesita anti-captcha en cada búsqueda y descarga." },
];

const COMMON_LABELS: Record<string, string> = {
  username: "Usuario",
  password: "Contraseña",
  cookies: "Cookies",
  user_agent: "User-Agent",
  api_key: "API key",
  apikey: "API key",
  token: "Token",
  email: "Correo",
  base_url: "URL base",
};

export function fieldLabel(f: CatalogField): string {
  return f.label ?? COMMON_LABELS[f.key] ?? f.key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export const catalogProvider = (key: string) => BAZARR_PROVIDERS.find((p) => p.key === key);
