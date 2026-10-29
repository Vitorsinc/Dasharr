//! Idiomas de subtítulos de una release de Nyaa. Sonarr/Radarr solo ven el título, pero la página del
//! torrent (`/view/<id>`) suele decirlos en la descripción (líneas «Subtitles: …» o un MediaInfo pegado)
//! o en la lista de archivos (`.spa.ass`, `Subs/Spanish/…`). No hay API: se lee el HTML.
use std::time::Duration;

use reqwest::StatusCode;
use scraper::{ElementRef, Html, Node, Selector};
use serde::Serialize;

use crate::filmaffinity::Throttle;

const TIMEOUT: Duration = Duration::from_secs(15);
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const SUB_EXTS: &[&str] = &["ass", "ssa", "srt", "sup", "vtt", "idx"];

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum NyaaError {
    /// Nyaa ha respondido 429/403: hay que dejar de preguntar un rato.
    #[error("Nyaa ha limitado las consultas")]
    Blocked,
    #[error("Nyaa no responde: {0}")]
    Network(String),
    #[error("La página de Nyaa no tiene el formato esperado")]
    Unexpected,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct NyaaPage {
    pub description: String,
    pub files: Vec<String>,
}

pub fn http_client() -> reqwest::Client {
    reqwest::Client::builder().timeout(TIMEOUT).user_agent(USER_AGENT).build().expect("cliente HTTP")
}

/// `https://<host>/view/<id>` si la URL es la página de un torrent de Nyaa (o de un espejo).
pub fn view_url(url: &str) -> Option<String> {
    let u = url::Url::parse(url).ok()?;
    let host = u.host_str()?;
    if !host.contains("nyaa") {
        return None;
    }
    let mut segs = u.path_segments()?.filter(|s| !s.is_empty());
    match (segs.next(), segs.next()) {
        (Some("view"), Some(id)) if id.chars().all(|c| c.is_ascii_digit()) => Some(format!("{}://{host}/view/{id}", u.scheme())),
        _ => None,
    }
}

/// Lee la página y devuelve los idiomas de subtítulos encontrados (vacío si no lo indica).
pub async fn subtitles(http: &reqwest::Client, throttle: &Throttle, gap: Duration, url: &str) -> Result<Vec<String>, NyaaError> {
    throttle.wait(gap).await;
    let res = http.get(url).send().await.map_err(|e| NyaaError::Network(e.to_string()))?;
    match res.status() {
        StatusCode::TOO_MANY_REQUESTS | StatusCode::FORBIDDEN => return Err(NyaaError::Blocked),
        StatusCode::NOT_FOUND => return Ok(vec![]),
        s if !s.is_success() => return Err(NyaaError::Network(format!("HTTP {}", s.as_u16()))),
        _ => {}
    }
    let html = res.text().await.map_err(|e| NyaaError::Network(e.to_string()))?;
    let page = parse_view(&html).ok_or(NyaaError::Unexpected)?;
    Ok(languages(&page))
}

fn sel(s: &str) -> Selector {
    Selector::parse(s).expect("selector")
}

/// Descripción (markdown en crudo: Nyaa la convierte en el navegador) y rutas de la lista de archivos.
pub fn parse_view(html: &str) -> Option<NyaaPage> {
    let doc = Html::parse_document(html);
    let description = doc.select(&sel("#torrent-description")).next()?.text().collect::<String>();
    let mut files = Vec::new();
    for li in doc.select(&sel(".torrent-file-list li")) {
        if li.select(&sel("ul")).next().is_some() {
            continue;
        }
        let name = own_text(li);
        if name.is_empty() {
            continue;
        }
        let mut path: Vec<String> = li
            .ancestors()
            .filter_map(ElementRef::wrap)
            .filter(|e| e.value().name() == "li")
            .filter_map(|e| e.select(&sel("a.folder")).next().map(|a| a.text().collect::<String>().trim().to_string()))
            .collect();
        path.reverse();
        path.push(name);
        files.push(path.join("/"));
    }
    Some(NyaaPage { description, files })
}

/// Texto propio del elemento, sin el tamaño ni los iconos.
fn own_text(el: ElementRef) -> String {
    el.children()
        .filter_map(|n| match n.value() {
            Node::Text(t) => Some(t.to_string()),
            _ => None,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

/// Idiomas en orden de aparición: MediaInfo, líneas de subtítulos de la descripción y archivos sueltos.
pub fn languages(page: &NyaaPage) -> Vec<String> {
    let mut out = Vec::new();
    for code in mediainfo_langs(&page.description)
        .into_iter()
        .chain(described_langs(&page.description))
        .chain(page.files.iter().flat_map(|f| file_langs(f)))
    {
        if !out.contains(&code) {
            out.push(code);
        }
    }
    out
}

/// Pistas «Text» de un MediaInfo pegado en la descripción.
fn mediainfo_langs(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut in_text = false;
    let mut track: Vec<String> = Vec::new();
    let flush = |track: &mut Vec<String>, out: &mut Vec<String>| {
        if !track.is_empty() {
            let mut codes = phrase_langs(&track.join(" "), true);
            if codes.contains(&"es-419".to_string()) {
                codes.retain(|c| c != "es");
            }
            out.extend(codes);
            track.clear();
        }
    };
    for raw in text.lines() {
        let line = raw.trim().trim_matches(|c| c == '`' || c == '*');
        if let Some(section) = section_name(line) {
            flush(&mut track, &mut out);
            in_text = section == "text";
            continue;
        }
        if !in_text {
            continue;
        }
        if let Some((key, value)) = line.split_once(':') {
            let key = key.trim().to_lowercase();
            if key == "language" || key == "title" {
                track.push(value.trim().to_string());
            }
        }
    }
    flush(&mut track, &mut out);
    out
}

/// «Text», «Text #2», «Audio #1»… como cabecera de sección del MediaInfo.
fn section_name(line: &str) -> Option<String> {
    let first = line.split_whitespace().next()?.to_lowercase();
    let rest: Vec<&str> = line.split_whitespace().skip(1).collect();
    let known = ["general", "video", "audio", "text", "menu", "chapters", "image", "other"];
    let numbered = rest.is_empty() || (rest.len() == 1 && rest[0].starts_with('#') && rest[0][1..].chars().all(|c| c.is_ascii_digit()));
    (known.contains(&first.as_str()) && numbered).then_some(first)
}

/// Líneas tipo «Subtitles: English, Spanish», tablas «| Subs | ENG, SPA |» y listas bajo «Subtitles:»
/// (Erai-raws: «* `Subtitles Info:`» y debajo una línea por idioma, «**Spanish** (CR_Spanish) | ASS»).
fn described_langs(text: &str) -> Vec<String> {
    let text = text.replace("<br />", "\n").replace("<br/>", "\n").replace("<br>", "\n");
    let mut out = Vec::new();
    // Dentro de una lista de subtítulos; `found` dice si ya se leyó algún elemento.
    let mut list: Option<bool> = None;
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() {
            // Una línea en blanco justo tras la etiqueta no cierra la lista; tras los idiomas, sí.
            if list == Some(true) {
                list = None;
            }
            continue;
        }
        if line.starts_with('|') {
            list = None;
            let cells: Vec<&str> = line.split('|').map(str::trim).collect();
            if let Some(i) = cells.iter().position(|c| is_sub_label(c)) {
                for cell in &cells[i + 1..] {
                    out.extend(list_langs(cell));
                }
            }
            continue;
        }
        let clean = line.trim_start_matches(|c: char| "-*+>#• ".contains(c));
        if let Some((label, value)) = clean.split_once(':').or_else(|| clean.split_once('：')) {
            if is_label(label) {
                if is_sub_label(label) {
                    let found = list_langs(value);
                    list = found.is_empty().then_some(false);
                    out.extend(found);
                } else {
                    list = None;
                }
                continue;
            }
        } else if is_sub_label(clean) {
            list = Some(false);
            continue;
        }
        if list.is_some() {
            out.extend(list_langs(clean));
            list = Some(true);
        }
    }
    out
}

/// Parece una etiqueta («Subtitles Info», «`Chapters», «**Audio**») y no una frase con dos puntos.
fn is_label(s: &str) -> bool {
    let s = s.trim_matches(|c: char| !c.is_alphanumeric());
    !s.is_empty() && s.len() <= 30 && s.split_whitespace().count() <= 4
}

fn is_sub_label(s: &str) -> bool {
    let s = fold(s.trim_matches(|c: char| !c.is_alphanumeric()));
    !s.is_empty() && s.len() <= 30 && s.contains("sub") && !s.contains("audio") && !s.contains("dub")
}

/// Cada elemento de una lista: el nombre completo vale siempre; los códigos (ENG, es-LA) solo si el
/// elemento es corto, para no confundir «it» o «de» de una frase con italiano o alemán.
fn list_langs(value: &str) -> Vec<String> {
    let value = value.replace(" and ", ",").replace(" y ", ",");
    value
        .split(|c| ",/|+;&".contains(c))
        // «Subtitles: English | Audio: Japanese»: lo que va tras otra etiqueta ya no son subtítulos.
        .take_while(|item| !item.contains(':'))
        .flat_map(|item| {
            let words = words(item);
            let mut codes = phrase_langs(item, words.len() <= 2);
            // «Spanish (CR_Spanish(Latin_America))» es una sola pista: la variante regional.
            if codes.iter().any(|c| c == "es-419") {
                codes.retain(|c| c != "es");
            }
            if codes.iter().any(|c| c == "pt-BR") {
                codes.retain(|c| c != "pt");
            }
            codes
        })
        .collect()
}

/// Archivos de subtítulos sueltos: códigos al final del nombre (`.spa.ass`, `_eng.srt`) y nombres de idioma
/// en cualquier parte de la ruta (`Subs/Spanish/…`).
fn file_langs(path: &str) -> Vec<String> {
    let Some((stem, ext)) = path.rsplit_once('.') else { return vec![] };
    if !SUB_EXTS.contains(&ext.to_lowercase().as_str()) {
        return vec![];
    }
    let name = stem.rsplit('/').next().unwrap_or(stem);
    let tail: Vec<&str> = name.rsplit('.').take(3).collect();
    let mut out = phrase_langs(path, false);
    for seg in tail.iter().rev() {
        let last = seg.rsplit(['_', ' ', '[', '(']).next().unwrap_or(seg);
        for code in phrase_langs(last, true) {
            if !out.contains(&code) {
                out.push(code);
            }
        }
    }
    out
}

/// Minúsculas y sin tildes, para comparar «Español» con «espanol».
fn fold(s: &str) -> String {
    s.chars()
        .flat_map(char::to_lowercase)
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ä' | 'ã' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'ö' | 'õ' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ñ' => 'n',
            'ç' => 'c',
            c => c,
        })
        .collect()
}

fn words(s: &str) -> Vec<String> {
    fold(s).split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()).map(str::to_string).collect()
}

const NAMES: &[(&str, &str)] = &[
    ("english", "en"),
    ("ingles", "en"),
    ("spanish", "es"),
    ("espanol", "es"),
    ("castellano", "es"),
    ("castilian", "es"),
    ("latino", "es-419"),
    ("portuguese", "pt"),
    ("portugues", "pt"),
    ("brazilian", "pt-BR"),
    ("french", "fr"),
    ("francais", "fr"),
    ("frances", "fr"),
    ("german", "de"),
    ("deutsch", "de"),
    ("aleman", "de"),
    ("italian", "it"),
    ("italiano", "it"),
    ("russian", "ru"),
    ("arabic", "ar"),
    ("japanese", "ja"),
    ("chinese", "zh"),
    ("korean", "ko"),
    ("polish", "pl"),
    ("turkish", "tr"),
    ("indonesian", "id"),
    ("vietnamese", "vi"),
    ("thai", "th"),
    ("malay", "ms"),
    ("hindi", "hi"),
    ("dutch", "nl"),
    ("catalan", "ca"),
    ("catala", "ca"),
];

const CODES: &[(&str, &str)] = &[
    ("eng", "en"),
    ("spa", "es"),
    ("esp", "es"),
    ("lat", "es-419"),
    ("por", "pt"),
    ("fre", "fr"),
    ("fra", "fr"),
    ("ger", "de"),
    ("deu", "de"),
    ("ita", "it"),
    ("rus", "ru"),
    ("ara", "ar"),
    ("jpn", "ja"),
    ("jap", "ja"),
    ("chi", "zh"),
    ("zho", "zh"),
    ("chs", "zh"),
    ("cht", "zh"),
    ("kor", "ko"),
    ("pol", "pl"),
    ("tur", "tr"),
    ("ind", "id"),
    ("vie", "vi"),
    ("tha", "th"),
    ("msa", "ms"),
    ("may", "ms"),
    ("hin", "hi"),
    ("dut", "nl"),
    ("nld", "nl"),
    ("cat", "ca"),
    ("en", "en"),
    ("es", "es"),
    ("pt", "pt"),
    ("fr", "fr"),
    ("de", "de"),
    ("it", "it"),
    ("ru", "ru"),
    ("ar", "ar"),
    ("ja", "ja"),
    ("jp", "ja"),
    ("zh", "zh"),
    ("ko", "ko"),
    ("pl", "pl"),
    ("tr", "tr"),
    ("id", "id"),
    ("vi", "vi"),
    ("th", "th"),
    ("ms", "ms"),
    ("nl", "nl"),
];

/// Variantes regionales: «Spanish (Latin America)», «es-LA», «spa-419», «Portuguese (Brazil)», «pt-BR».
const LATAM: &[&str] = &["latin", "latino", "latam", "la", "419", "mx", "mexico", "lat"];
const BRAZIL: &[&str] = &["br", "brazil", "brasil", "brazilian"];

/// Códigos de idioma de una frase corta. `codes` permite también ENG, spa, es…
fn phrase_langs(phrase: &str, codes: bool) -> Vec<String> {
    let ws = words(phrase);
    let mut out: Vec<String> = Vec::new();
    for (i, w) in ws.iter().enumerate() {
        let hit = NAMES
            .iter()
            .find(|(n, _)| n == w)
            .or_else(|| if codes { CODES.iter().find(|(c, _)| c == w) } else { None })
            .map(|(_, code)| code.to_string());
        let Some(mut code) = hit else { continue };
        let next: Vec<&str> = ws[i + 1..].iter().take(2).map(String::as_str).collect();
        if code == "es" && next.iter().any(|n| LATAM.contains(n)) {
            code = "es-419".into();
        }
        if code == "pt" && next.iter().any(|n| BRAZIL.contains(n)) {
            code = "pt-BR".into();
        }
        // «la» o «lat» detrás de otro idioma ya cuenta como su variante, no como idioma propio.
        if code == "es-419" && w == "lat" && out.last().is_some_and(|c| c.starts_with("es")) {
            continue;
        }
        if !out.contains(&code) {
            out.push(code);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn page(description: &str, files: &[&str]) -> NyaaPage {
        NyaaPage { description: description.into(), files: files.iter().map(|s| s.to_string()).collect() }
    }

    #[test]
    fn recognises_nyaa_view_urls() {
        assert_eq!(view_url("https://nyaa.si/view/1868340"), Some("https://nyaa.si/view/1868340".into()));
        assert_eq!(view_url("https://nyaa.si/view/1868340/"), Some("https://nyaa.si/view/1868340".into()));
        assert_eq!(view_url("https://nyaa.land/view/12?x=1"), Some("https://nyaa.land/view/12".into()));
        assert_eq!(view_url("https://nyaa.si/download/1868340.torrent"), None);
        assert_eq!(view_url("https://example.com/view/1"), None);
        assert_eq!(view_url("no es una url"), None);
    }

    #[test]
    fn parses_the_view_page() {
        let html = r#"<html><body>
          <div markdown-text class="panel-body" id="torrent-description">**Subtitles:** English, Spanish &amp; more</div>
          <div class="torrent-file-list panel-body"><ul>
            <li><a href="" class="folder"><i class="fa fa-folder-open"></i>Show S01</a>
              <ul data-show="yes">
                <li><i class="fa fa-file"></i>Show - 01.mkv <span class="file-size">(1.4 GiB)</span></li>
                <li><a href="" class="folder"><i class="fa fa-folder-open"></i>Subs</a>
                  <ul><li><i class="fa fa-file"></i>Show - 01.spa.ass <span class="file-size">(40 KiB)</span></li></ul>
                </li>
              </ul>
            </li>
          </ul></div></body></html>"#;
        let p = parse_view(html).unwrap();
        assert_eq!(p.description, "**Subtitles:** English, Spanish & more");
        assert_eq!(p.files, vec!["Show S01/Show - 01.mkv", "Show S01/Subs/Show - 01.spa.ass"]);
        assert_eq!(languages(&p), vec!["en", "es"]);
        assert!(parse_view("<html><body>Cloudflare</body></html>").is_none());
    }

    #[test]
    fn reads_mediainfo_text_tracks() {
        let d = "```\nGeneral\nComplete name : x.mkv\n\nAudio #1\nLanguage : Japanese\n\nText #1\nID : 3\nFormat : ASS\nTitle : English [CR]\nLanguage : English\n\nText #2\nTitle : Spanish (Latin America)\nLanguage : Spanish\n\nText #3\nLanguage : Spanish\nTitle : Español (España)\n\nMenu\n00:00:00.000 : Opening\n```";
        assert_eq!(languages(&page(d, &[])), vec!["en", "es-419", "es"]);
    }

    #[test]
    fn reads_subtitle_lines_tables_and_lists() {
        let d = "Video: 1080p HEVC\nAudio: Japanese, English\nSubtitles: English, Spanish (Latin America), Portuguese (Brazil)";
        assert_eq!(languages(&page(d, &[])), vec!["en", "es-419", "pt-BR"]);
        let d = "| Audio | JPN |\n|---|---|\n| Subs | ENG, SPA, POR-BR |";
        assert_eq!(languages(&page(d, &[])), vec!["en", "es", "pt-BR"]);
        let d = "**Softsubs:**\n- English\n- Español\n\nThanks to the encoders!";
        assert_eq!(languages(&page(d, &[])), vec!["en", "es"]);
        let d = "Subtitles: English | Audio: Japanese";
        assert_eq!(languages(&page(d, &[])), vec!["en"]);
        let d = "Subtítulos: Castellano y Latino";
        assert_eq!(languages(&page(d, &[])), vec!["es", "es-419"]);
    }

    #[test]
    fn reads_erai_raws_subtitle_info() {
        let d = "[Erai-raws]( https://www.erai-raws.info/anime-list/dragon-ball-super-beerus/ )\n\n\
* `Video Info:`  \n**Japanese** ([Erai-raws]_HEVC_CR) | **HEVC** | **Main 10@L4** | **1920x1080** | **4099 kbps**  \n\n\
* `Audio Info:`  \n**Japanese** ([Erai-raws]_AAC_CR) | **AAC** | **2.0** | **192 kbps**  \n\n\
* `Subtitles Info:`  \n**English** (CR_English) | ASS  \n**Portuguese** (CR_Portuguese(Brazil)) | ASS  \n\
**Spanish** (CR_Spanish(Latin_America)) | ASS  \n**Spanish** (CR_Spanish) | ASS  \n**Arabic** (CR_Arabic) | ASS  \n\
**Chinese** (CR_Chinese(Traditional)) | ASS  \n**Polish** (CR_Polish) | ASS  \n\n\
* `Chapters:` **Yes**\n* `Duration:` **~00:23:17**";
        assert_eq!(languages(&page(d, &[])), vec!["en", "pt-BR", "es-419", "es", "ar", "zh", "pl"]);
        // Igual con la lista en HTML y una línea en blanco tras la etiqueta.
        let d = "<li><code>Subtitles Info:</code><br>\n\n<b>Spanish</b> (CR_Spanish) | ASS<br><b>French</b> (CR_French) | ASS</li>\n\nChapters: Yes";
        assert_eq!(languages(&page(d, &[])), vec!["es", "fr"]);
    }

    #[test]
    fn ignores_audio_and_prose() {
        let d = "Audio: Spanish, English\nDual audio. It is the best release, de verdad.\nMulti-Subs";
        assert!(languages(&page(d, &[])).is_empty());
        let d = "Subtitles: it is a softsub release";
        assert!(languages(&page(d, &[])).is_empty());
    }

    #[test]
    fn reads_loose_subtitle_files() {
        let files = [
            "Show/Show - 01.mkv",
            "Show/Subs/Show - 01.spa.ass",
            "Show/Subs/Show - 01_eng.srt",
            "Show/Subtitles/Portuguese (Brazil)/Show - 01.ass",
            "Show/Show - 01.de.mkv",
        ];
        assert_eq!(languages(&page("", &files)), vec!["es", "en", "pt-BR"]);
    }
}
