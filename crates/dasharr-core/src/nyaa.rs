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

/// Pistas de subtítulos de un MediaInfo pegado en la descripción: secciones «Text» (o «-- Subtitle --» en el
/// formato resumido) y, si el MediaInfo viene sin cabeceras, bloques cuyo «Format» es de subtítulos (ASS, PGS…).
fn mediainfo_langs(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut in_text = false;
    let mut sub_format = false;
    let mut last_key = String::new();
    let mut track: Vec<String> = Vec::new();
    let flush = |track: &mut Vec<String>, is_text: bool, out: &mut Vec<String>| {
        if is_text && !track.is_empty() {
            out.extend(regional(phrase_langs(&track.join(" "), true)));
        }
        track.clear();
    };
    for raw in text.lines() {
        let line = raw.trim().trim_matches(|c| c == '`' || c == '*');
        if let Some(section) = section_name(line) {
            flush(&mut track, in_text || sub_format, &mut out);
            in_text = section == "text";
            sub_format = false;
            continue;
        }
        if line.is_empty() {
            flush(&mut track, in_text || sub_format, &mut out);
            sub_format = false;
            continue;
        }
        let Some((key, value)) = line.split_once(':') else { continue };
        let key = key.trim().to_lowercase();
        // «Language(s) : English» y debajo «   : Brazilian Portuguese»: cada línea es una pista.
        if key.is_empty() && last_key.starts_with("language") {
            flush(&mut track, in_text || sub_format, &mut out);
            track.push(value.trim().to_string());
            flush(&mut track, in_text || sub_format, &mut out);
            continue;
        }
        let first = value.split_whitespace().next().unwrap_or("").to_lowercase();
        if key == "format" && SUB_FORMATS.contains(&first.as_str()) {
            sub_format = true;
        }
        if key == "language" || key == "language(s)" || key == "title" {
            track.push(value.trim().to_string());
        }
        last_key = key;
    }
    flush(&mut track, in_text || sub_format, &mut out);
    out
}

const SUB_FORMATS: &[&str] = &["ass", "ssa", "utf-8", "pgs", "subrip", "srt", "vobsub", "webvtt", "vtt"];

/// «Spanish (Latin America)» es una sola pista: si sale la variante regional, sobra el idioma a secas.
fn regional(mut codes: Vec<String>) -> Vec<String> {
    if codes.iter().any(|c| c == "es-419") {
        codes.retain(|c| c != "es");
    }
    if codes.iter().any(|c| c == "pt-BR") {
        codes.retain(|c| c != "pt");
    }
    codes
}

/// «Text», «Text #2», «Audio #1»… como cabecera de sección del MediaInfo; también «-- Subtitle --».
fn section_name(line: &str) -> Option<String> {
    if let Some(inner) = line.strip_prefix("--").and_then(|l| l.strip_suffix("--")) {
        let name = inner.trim().to_lowercase();
        return Some(if name.starts_with("subtitle") { "text".into() } else { name });
    }
    let first = line.split_whitespace().next()?.to_lowercase();
    let rest: Vec<&str> = line.split_whitespace().skip(1).collect();
    let known = ["general", "video", "audio", "text", "menu", "chapters", "image", "other"];
    let numbered = rest.is_empty() || (rest.len() == 1 && rest[0].starts_with('#') && rest[0][1..].chars().all(|c| c.is_ascii_digit()));
    (known.contains(&first.as_str()) && numbered).then_some(first)
}

/// Líneas tipo «Subtitles: English, Spanish», listas bajo «Subtitles:» (Erai-raws: «* `Subtitles Info:`» y debajo
/// una línea por idioma, «**Spanish** (CR_Spanish) | ASS») y tablas markdown, con o sin «|» al principio:
/// - fila con etiqueta: «| Subs | ENG, SPA |», «**Subtitles** | English, French» (Trix);
/// - columna con etiqueta: «| Subtitle Language | Sync/Edit By |» (Mr. Yosha), «**General** | … | **Subtitle**» (EMBER);
/// - tabla bajo un título «### Subtitles», una pista por fila (AnoZu).
fn described_langs(text: &str) -> Vec<String> {
    let text = text.replace("<br />", "\n").replace("<br/>", "\n").replace("<br>", "\n");
    let lines: Vec<&str> = text.lines().map(str::trim).collect();
    let mut out = Vec::new();
    // Dentro de una lista de subtítulos; `found` dice si ya se leyó algún elemento.
    let mut list: Option<bool> = None;
    // Columna de subtítulos de la tabla en curso, y si ya se pasó la fila separadora («---|---»).
    let mut column: Option<usize> = None;
    let mut in_table = false;
    for (i, &line) in lines.iter().enumerate() {
        if line.is_empty() {
            // Una línea en blanco justo tras la etiqueta no cierra la lista; tras los idiomas, sí.
            if list == Some(true) {
                list = None;
            }
            column = None;
            in_table = false;
            continue;
        }
        let cells = table_cells(line);
        let next_is_separator = lines.get(i + 1).is_some_and(|l| l.contains('|') && is_separator(&table_cells(l)));
        let label_row = cells.first().is_some_and(|c| !c.contains(':') && is_sub_label(c));
        let is_row = line.contains('|') && (line.starts_with('|') || in_table || column.is_some() || next_is_separator || label_row);
        if !is_row {
            column = None;
            in_table = false;
        } else {
            if is_separator(&cells) {
                in_table = true;
                continue;
            }
            if let Some(col) = column {
                if let Some(cell) = cells.get(col) {
                    // «**Language:** English-Signs + Dialogue»: de una celda con etiqueta vale lo de detrás.
                    let value = cell.split_once(':').filter(|(l, _)| is_label(l)).map_or(*cell, |(_, v)| v);
                    out.extend(regional(list_langs(value)));
                }
                continue;
            }
            if next_is_separator {
                if let Some(col) = cells.iter().position(|c| is_sub_label(c)) {
                    column = Some(col);
                    list = None;
                    continue;
                }
            }
            if list.is_some() {
                out.extend(regional(cells.iter().flat_map(|c| list_langs(c)).collect()));
                list = Some(true);
                continue;
            }
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
            // «**Greek Subs**»: el idioma puede venir en la propia etiqueta.
            out.extend(phrase_langs(clean, false));
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

/// Celdas de una fila de tabla markdown, sin las vacías de los «|» de los extremos.
fn table_cells(line: &str) -> Vec<&str> {
    let line = line.trim();
    let line = line.strip_prefix('|').unwrap_or(line);
    let line = line.strip_suffix('|').unwrap_or(line);
    line.split('|').map(str::trim).collect()
}

/// «|---|:---:|» o «--- | ---».
fn is_separator(cells: &[&str]) -> bool {
    cells.iter().any(|c| c.contains('-')) && cells.iter().all(|c| !c.is_empty() && c.chars().all(|c| "-: ".contains(c)))
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
    // «Multi-Subs : ENG(US) ES(LA) …» (DKB): lo que va tras una etiqueta de subtítulos es la lista.
    let value = match value.split_once(':') {
        Some((label, rest)) if is_sub_label(label) => rest,
        _ => value,
    };
    let value = strip_markup(value).replace(" and ", ",").replace(" y ", ",");
    value
        .split(|c| ",/|+;&".contains(c))
        // «Subtitles: English | Audio: Japanese»: lo que va tras otra etiqueta ya no son subtítulos.
        .take_while(|item| !item.contains(':'))
        .flat_map(|item| {
            // «ENG(US) ES(LA) FRE PT(BR)»: códigos separados solo por espacios, cada uno es un idioma.
            let tokens: Vec<&str> = item.split_whitespace().collect();
            if tokens.len() > 2 && tokens.iter().all(|t| is_lang_token(t)) {
                return tokens.iter().flat_map(|t| regional(phrase_langs(t, true))).collect();
            }
            // «Spanish (CR_Spanish(Latin_America))» es una sola pista: la variante regional.
            regional(phrase_langs(item, words(item).len() <= 2))
        })
        .collect()
}

/// «ENG», «ES(LA)», «ZH-HK», «Spanish»: un idioma con, como mucho, su región.
fn is_lang_token(token: &str) -> bool {
    let ws = words(token);
    ws.len() <= 2 && ws.first().is_some_and(|w| NAMES.iter().chain(CODES).any(|(n, _)| n == w))
}

/// Quita lo que no es texto y tiene «:» o «/»: banderas como imagen (`![fr](https://…)`, `<img …>`),
/// emojis en código (`:flag_fr:`) y enlaces sueltos. Si no, «Subtitle(s): 🇫🇷 French / ASS» se cortaría.
fn strip_markup(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(c) = rest.chars().next() {
        let skip = if c == '<' {
            rest.find('>').map(|i| i + 1)
        } else if rest.starts_with("![") || c == '[' {
            // Imagen o enlace markdown: se queda el texto del enlace, nunca la URL.
            rest.find("](").and_then(|i| rest[i..].find(')').map(|j| (i, i + j + 1))).map(|(i, end)| {
                if c == '[' {
                    out.push_str(&rest[1..i]);
                }
                end
            })
        } else if c == ':' {
            let name = rest[1..].find(':').map(|j| &rest[1..1 + j]);
            name.filter(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_alphanumeric() || "_+-".contains(c))).map(|n| n.len() + 2)
        } else if rest.starts_with("http://") || rest.starts_with("https://") {
            Some(rest.find(char::is_whitespace).unwrap_or(rest.len()))
        } else {
            None
        };
        match skip {
            Some(n) => {
                out.push(' ');
                rest = &rest[n..];
            }
            None => {
                out.push(c);
                rest = &rest[c.len_utf8()..];
            }
        }
    }
    out
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
    ("greek", "el"),
    ("hungarian", "hu"),
    ("czech", "cs"),
    ("romanian", "ro"),
    ("swedish", "sv"),
    ("ukrainian", "uk"),
    ("hebrew", "he"),
    ("finnish", "fi"),
    ("danish", "da"),
    ("bulgarian", "bg"),
    ("croatian", "hr"),
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
    ("gre", "el"),
    ("ell", "el"),
    ("hun", "hu"),
    ("cze", "cs"),
    ("ces", "cs"),
    ("rum", "ro"),
    ("ron", "ro"),
    ("swe", "sv"),
    ("ukr", "uk"),
    ("heb", "he"),
    ("fin", "fi"),
    ("dan", "da"),
    ("bul", "bg"),
    ("hrv", "hr"),
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
        // «Latin America Spanish», «Brazilian Portuguese»: la región también puede ir delante.
        let prev = i.checked_sub(1).map(|j| ws[j].as_str());
        if code == "es" && (next.iter().any(|n| LATAM.contains(n)) || prev.is_some_and(|p| ["latin", "america", "latam", "latino"].contains(&p))) {
            code = "es-419".into();
        }
        if code == "pt" && (next.iter().any(|n| BRAZIL.contains(n)) || prev.is_some_and(|p| BRAZIL.contains(&p))) {
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
    fn reads_tsundere_raws_subtitles_with_flags() {
        let line = |flags: [&str; 3]| {
            format!(
                "**Dragon Ball Super: Beerus - S01E01**\n\n---\n\n\
* **Video:** 4 825 kb/s / 1080p (1920x1080) / 23.976 (24000/1001) FPS / x264 (High@L4.1)\n\
* **Audio(s):** {jp} Japanese / AAC 2.0 / 229 kb/s / 44.1 kHz\n\
* **Subtitle(s):** {} French (France) / ASS | {} German (Germany) / ASS | {} Polish (Poland) / ASS\n\
* **Duration:** 0:23:17.688\n* **Others:** [CRC32](https://tsundere.to/x) | [Mediainfo](https://tsundere.to/y)",
                flags[0],
                flags[1],
                flags[2],
                jp = flags[0]
            )
        };
        let expected = vec!["fr", "de", "pl"];
        assert_eq!(languages(&page(&line(["🇫🇷", "🇩🇪", "🇵🇱"]), &[])), expected);
        assert_eq!(languages(&page(&line([":flag_fr:", ":flag_de:", ":flag_pl:"]), &[])), expected);
        assert_eq!(
            languages(&page(&line(["![fr](https://flagcdn.com/16x12/fr.png)", "![de](https://flagcdn.com/16x12/de.png)", "![pl](https://flagcdn.com/16x12/pl.png)"]), &[])),
            expected
        );
        assert_eq!(
            languages(&page(&line(["<img src=\"https://flagcdn.com/fr.png\">", "<img src=\"https://flagcdn.com/de.png\">", "<img src=\"https://flagcdn.com/pl.png\">"]), &[])),
            expected
        );
    }

    #[test]
    fn reads_dkb_multi_subs_codes() {
        let d = "| Anime | Dragon Ball Super: Beerus - (Season 01) |\n| ------------- |:-------------:| -----:|\n\
| Audio | Japanese AAC |\n| Subtitles | Multi-Subs : ENG(US) ES(LA) ES(EU) FRE PT(BR) ARA ITA GER RUS POL TH ID ZH-HK |\n\
| Discord | [Here](https://discord.gg/x) |";
        assert_eq!(languages(&page(d, &[])), vec!["en", "es-419", "es", "fr", "pt-BR", "ar", "it", "de", "ru", "pl", "th", "id", "zh"]);
    }

    #[test]
    fn reads_anozu_subtitles_table() {
        let d = "### Audio\n\n| Track | Codec | Channels | Source | Default | Forced |\n| --- | --- | --- | --- | --- | --- |\n\
| **Japanese** | AAC | 2.0 | Crunchyroll | Yes | No |\n\n### Subtitles\n\n| Track | Language | Format | Default | Forced |\n\
| --- | --- | --- | --- | --- |\n| **English** | English | ASS | Yes | No |\n| **Spanish (Latin America)** | Spanish | ASS | Yes | No |\n\
| **Spanish (Spain)** | Spanish | ASS | Yes | No |\n| **Portuguese (Brazil)** | Portuguese | ASS | Yes | No |\n\n### Chapters: Yes";
        assert_eq!(languages(&page(d, &[])), vec!["en", "es-419", "es", "pt-BR"]);
    }

    #[test]
    fn reads_subtitle_columns() {
        // Mr. Yosha: la cabecera de la columna dice que son subtítulos.
        let d = "| Audio Source | Codec |\n|:---:|:---:|\n| AMZN | E-AC3 |\n\n| Subtitle Language        | Sync/Edit By |\n\
|:-------------:|:-------------:|\n| English        | emr3ald/SonicMaster |\n| Japanese | SonicMaster |\n\n[Video Comparison](https://slow.pics/c/x)";
        assert_eq!(languages(&page(d, &[])), vec!["en", "ja"]);
        // EMBER: tabla sin «|» en los extremos, una columna por tipo de pista y celdas «**Clave:** valor».
        let d = "**General** | **Video** | **Audio** | **Subtitle**\n--- | --- | --- | ---\n\
**File Name:** S02E15.mkv | **Format:** HEVC | **Format:** E-AC-3 | **Format:** ASS [MALD]\n\
**Size:** 363 MiB | **Profile:** Main 10 | **Bit rate:** 224 kb/s | **Language:** English-Signs + Dialogue\n\
 --- | **Frame Rate:** 23.976 FPS | **Language:** Japanese+English | ---";
        assert_eq!(languages(&page(d, &[])), vec!["en"]);
        // Trix: fila con etiqueta en una tabla sin «|» al principio.
        let d = "Get [DDL](https://x.org) | **Shingeki no Kyojin**\n:---:|:---:\n**Audio Language** | Japanese, English\n\
**Subtitles** | English (Full), English (Signs), French";
        assert_eq!(languages(&page(d, &[])), vec!["en", "fr"]);
    }

    #[test]
    fn reads_short_and_headerless_mediainfo() {
        // Rapta: MediaInfo resumido, un idioma por línea.
        let d = "-- Audio --\nFormat                      : AAC\nLanguage(s)                 : Japanese\n\n-- Subtitle --\n\
Language(s)                 : English\n                            : Brazilian Portuguese\n                            : European Spanish\n\
                            : Latin America Spanish\n\n-- Screenshots --\nhttps://i.ibb.co/x/000001.png";
        assert_eq!(languages(&page(d, &[])), vec!["en", "pt-BR", "es", "es-419"]);
        // YURASUKA: MediaInfo sin cabeceras de sección; las pistas de subtítulos se reconocen por el formato.
        let d = "```\nTitle : SPY x FAMILY - S03E02\n\nVideo\nFormat : HEVC\nLanguage : Japanese\n\nFormat : E-AC-3\nTitle : English E-AC-3 2.0\n\
Language : English\n\nFormat : ASS\nTitle : Full Subtitles [CrappySubs]\nLanguage : English\n\nFormat : PGS\nLanguage : French\n\nMenu\n```";
        assert_eq!(languages(&page(d, &[])), vec!["en", "fr"]);
    }

    #[test]
    fn reads_language_in_the_label() {
        let d = "**Greek Subs**\n\nΕπισκεφθείτε τον Discord Server μας για περισσότερα!\n\nDiscord: https://discord.gg/x";
        assert_eq!(languages(&page(d, &[])), vec!["el"]);
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
