//! Nota de FilmAffinity a partir del título y el año. No hay API: se lee la búsqueda avanzada de la web
//! y, si la tarjeta no trae la nota, la ficha. El ritmo de peticiones lo marca quien llama con `Throttle`.
use std::path::Path;
use std::time::{Duration, Instant};

use reqwest::StatusCode;
use scraper::{ElementRef, Html, Selector};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

const BASE: &str = "https://www.filmaffinity.com/es/";
const TIMEOUT: Duration = Duration::from_secs(15);
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FaMatch {
    pub id: u64,
    pub url: String,
    pub title: String,
    pub year: Option<i32>,
    pub rating: Option<f32>,
    pub votes: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum FaError {
    /// FilmAffinity ha respondido 429/403: hay que dejar de preguntar un rato.
    #[error("FilmAffinity ha limitado las consultas")]
    Blocked,
    #[error("FilmAffinity no responde: {0}")]
    Network(String),
}

/// Espera mínima entre dos peticiones cualesquiera a FilmAffinity.
#[derive(Default)]
pub struct Throttle {
    last: Mutex<Option<Instant>>,
}

impl Throttle {
    pub async fn wait(&self, gap: Duration) {
        loop {
            let mut last = self.last.lock().await;
            let now = Instant::now();
            match *last {
                Some(t) if now < t + gap => {
                    let remaining = t + gap - now;
                    drop(last);
                    tokio::time::sleep(remaining).await;
                }
                _ => {
                    *last = Some(now);
                    return;
                }
            }
        }
    }
}

pub struct FaQuery<'a> {
    pub titles: Vec<&'a str>,
    pub year: Option<i32>,
    pub series: bool,
    /// Carpeta donde guardar la última búsqueda que no se ha sabido leer, para poder revisarla.
    pub dump_dir: Option<&'a Path>,
}

const DUMP_FILE: &str = "filmaffinity-busqueda.html";

pub fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(TIMEOUT)
        .user_agent(USER_AGENT)
        .cookie_store(true)
        .build()
        .expect("cliente HTTP")
}

/// Busca la ficha que mejor encaja y devuelve su nota. `Ok(None)` si no hay coincidencia clara.
pub async fn lookup(http: &reqwest::Client, throttle: &Throttle, gap: Duration, q: &FaQuery<'_>) -> Result<Option<FaMatch>, FaError> {
    let mut tried: Vec<String> = Vec::new();
    for title in &q.titles {
        let norm = normalize(title);
        if norm.is_empty() || tried.contains(&norm) {
            continue;
        }
        tried.push(norm);
        let (html, final_url) = get(http, throttle, gap, &search_url(title, q.year)).await?;
        // Con un único resultado la web salta directamente a la ficha.
        let candidates = match film_id(&final_url).or_else(|| detail_id(&html)) {
            Some(id) => parse_detail(&html, id).into_iter().collect(),
            None => parse_search(&html),
        };
        let year = q.year.map_or_else(String::new, |y| format!(" ({y})"));
        if candidates.is_empty() {
            log::info!("FilmAffinity: «{title}»{year} sin resultados");
            if let Some(dir) = q.dump_dir {
                let _ = std::fs::write(dir.join(DUMP_FILE), &html);
            }
            continue;
        }
        let n = candidates.len();
        let Some(mut found) = best_match(candidates, &q.titles, q.year, q.series) else {
            log::info!("FilmAffinity: «{title}»{year}: {n} resultados, ninguno encaja");
            continue;
        };
        if found.rating.is_none() {
            let (html, _) = get(http, throttle, gap, &found.url).await?;
            if let Some(detail) = parse_detail(&html, found.id) {
                found.rating = detail.rating;
                found.votes = detail.votes.or(found.votes);
            }
        }
        return Ok(Some(found));
    }
    Ok(None)
}

async fn get(http: &reqwest::Client, throttle: &Throttle, gap: Duration, url: &str) -> Result<(String, String), FaError> {
    throttle.wait(gap).await;
    let res = http
        .get(url)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "es-ES,es;q=0.9")
        .send()
        .await
        .map_err(|e| FaError::Network(e.to_string()))?;
    match res.status() {
        StatusCode::TOO_MANY_REQUESTS | StatusCode::FORBIDDEN => return Err(FaError::Blocked),
        s if !s.is_success() => return Err(FaError::Network(format!("HTTP {}", s.as_u16()))),
        _ => {}
    }
    let final_url = res.url().to_string();
    let body = res.text().await.map_err(|e| FaError::Network(e.to_string()))?;
    // Cuando limita, FilmAffinity puede responder 200 con una página de aviso.
    if is_rate_limited(&body) {
        return Err(FaError::Blocked);
    }
    Ok((body, final_url))
}

pub fn search_url(title: &str, year: Option<i32>) -> String {
    let mut url = url::Url::parse(&format!("{BASE}advsearch.php")).expect("url base");
    {
        let mut qp = url.query_pairs_mut();
        qp.append_pair("stext", title).append_pair("stype[]", "title");
        if let Some(y) = year {
            qp.append_pair("fromyear", &(y - 1).to_string()).append_pair("toyear", &(y + 1).to_string());
        }
    }
    url.to_string()
}

fn film_url(id: u64) -> String {
    format!("{BASE}film{id}.html")
}

fn film_id(url: &str) -> Option<u64> {
    let name = url.rsplit('/').next()?.split(['?', '#']).next()?;
    name.strip_prefix("film")?.strip_suffix(".html")?.parse().ok()
}

fn is_rate_limited(html: &str) -> bool {
    let head = &html[..html.len().min(4000)];
    head.to_ascii_lowercase().contains("too many request")
}

/// Id de la ficha si la página es una ficha (enlace canónico u og:url).
fn detail_id(html: &str) -> Option<u64> {
    let doc = Html::parse_document(html);
    doc.select(&sel("link[rel='canonical'], meta[property='og:url']"))
        .filter_map(|e| e.value().attr("href").or_else(|| e.value().attr("content")))
        .find_map(film_id)
}

fn sel(s: &str) -> Selector {
    Selector::parse(s).expect("selector")
}

fn text(e: ElementRef) -> String {
    e.text().collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ")
}

fn first_text(root: ElementRef, s: &str) -> Option<String> {
    root.select(&sel(s)).next().map(text).filter(|t| !t.is_empty())
}

/// El primer selector, en orden de preferencia, que tenga texto.
fn first_of(root: ElementRef, selectors: &[&str]) -> Option<String> {
    selectors.iter().find_map(|s| first_text(root, s))
}

/// "8,1" → 8.1; "--" o vacío → None. Si llega "7,6 58.120 votos" se queda con la primera cifra.
fn parse_rating(s: &str) -> Option<f32> {
    let s = s.split_whitespace().next()?;
    let cleaned: String = s.chars().filter(|c| c.is_ascii_digit() || *c == ',' || *c == '.').collect();
    let v: f32 = cleaned.replace(',', ".").parse().ok()?;
    (0.0..=10.0).contains(&v).then_some(v)
}

/// "158.246" → 158246.
fn parse_votes(s: &str) -> Option<u64> {
    let digits: String = s.chars().filter(char::is_ascii_digit).collect();
    digits.parse().ok()
}

fn year_in(s: &str) -> Option<i32> {
    s.split(|c: char| !c.is_ascii_digit())
        .filter(|p| p.len() == 4)
        .filter_map(|p| p.parse::<i32>().ok())
        .find(|y| (1880..=2100).contains(y))
}

/// Lee los resultados de la búsqueda. FilmAffinity cambia a menudo el marcado (2026: `.fa-card` con el enlace en
/// `a.d-md-inline-block` y el año en `.mc-year`), así que se aceptan varias formas y el id sale del enlace a la ficha.
pub fn parse_search(html: &str) -> Vec<FaMatch> {
    let doc = Html::parse_document(html);
    let link_sel = sel("a[href*='film']");
    let mut seen = Vec::new();
    // Del contenedor más externo al más interno: el primero que aparece se queda con el resultado.
    doc.select(&sel(".se-it, .item-search, .fa-card, .movie-card"))
        .filter_map(|c| {
            let film_link = c.select(&link_sel).find(|a| a.value().attr("href").and_then(film_id).is_some());
            let id = c
                .value()
                .attr("data-movie-id")
                .or_else(|| c.select(&sel("[data-movie-id]")).next().and_then(|e| e.value().attr("data-movie-id")))
                .and_then(|v| v.parse().ok())
                .or_else(|| film_link.and_then(|a| a.value().attr("href")).and_then(film_id))?;
            if seen.contains(&id) {
                return None;
            }
            seen.push(id);
            let title = first_text(c, ".mc-title a")
                .or_else(|| first_text(c, ".mc-title"))
                .or_else(|| first_text(c, "a.d-md-inline-block"))
                .or_else(|| {
                    c.select(&link_sel)
                        .filter(|a| a.value().attr("href").and_then(film_id) == Some(id))
                        .map(|a| {
                            let t = text(a);
                            if t.is_empty() { a.value().attr("title").unwrap_or_default().trim().to_string() } else { t }
                        })
                        .find(|t| !t.is_empty())
                })?;
            let year = first_text(c, ".mc-year, .ye-w").and_then(|y| year_in(&y)).or_else(|| year_in(&title));
            Some(FaMatch {
                id,
                url: film_url(id),
                title,
                year,
                rating: first_of(c, &[".avgrat-box", ".avg", ".avg-rating", "[class*='avgrat']", "[class*='avg-rat']"])
                    .and_then(|r| parse_rating(&r)),
                votes: first_of(c, &[".ratcount-box", ".count", ".rat-count", "[class*='ratcount']", "[class*='rat-count']"])
                    .and_then(|v| parse_votes(&v)),
            })
        })
        .collect()
}

pub fn parse_detail(html: &str, id: u64) -> Option<FaMatch> {
    let doc = Html::parse_document(html);
    let root = doc.root_element();
    let attr_or_text = |s: &str| {
        root.select(&sel(s)).next().map(|e| e.value().attr("content").map(str::to_string).unwrap_or_else(|| text(e)))
    };
    let title = first_text(root, "#main-title span[itemprop='name']")
        .or_else(|| first_text(root, "#main-title"))
        .or_else(|| first_text(root, "span[itemprop='name']"))?;
    Some(FaMatch {
        id,
        url: film_url(id),
        title,
        year: first_text(root, "[itemprop='datePublished']").and_then(|y| year_in(&y)),
        rating: attr_or_text("#movie-rat-avg").and_then(|r| parse_rating(&r)),
        votes: attr_or_text("[itemprop='ratingCount']").and_then(|v| parse_votes(&v)),
    })
}

/// Minúsculas, sin tildes, sin lo que va entre paréntesis ("(Serie de TV)", "(2008)") y sin signos.
pub fn normalize(s: &str) -> String {
    let mut out = String::new();
    let mut depth = 0;
    for c in s.chars().flat_map(char::to_lowercase) {
        match c {
            '(' | '[' => depth += 1,
            ')' | ']' => depth = (depth - 1).max(0),
            _ if depth > 0 => {}
            'á' | 'à' | 'â' | 'ä' | 'ã' => out.push('a'),
            'é' | 'è' | 'ê' | 'ë' => out.push('e'),
            'í' | 'ì' | 'î' | 'ï' => out.push('i'),
            'ó' | 'ò' | 'ô' | 'ö' | 'õ' => out.push('o'),
            'ú' | 'ù' | 'û' | 'ü' => out.push('u'),
            'ñ' => out.push('n'),
            'ç' => out.push('c'),
            '&' => out.push_str(" and "),
            c if c.is_alphanumeric() => out.push(c),
            _ => out.push(' '),
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn is_series_title(title: &str) -> bool {
    let t = title.to_lowercase();
    t.contains("serie de tv") || t.contains("miniserie")
}

/// Elige la tarjeta más parecida. Exige que el título encaje salvo que solo haya un resultado del mismo año.
pub fn best_match(candidates: Vec<FaMatch>, titles: &[&str], year: Option<i32>, series: bool) -> Option<FaMatch> {
    let wanted: Vec<String> = titles.iter().map(|t| normalize(t)).filter(|t| !t.is_empty()).collect();
    let only_one = candidates.len() == 1;
    candidates
        .into_iter()
        .filter_map(|c| {
            let name = normalize(&c.title);
            let title_score = if wanted.contains(&name) {
                3
            } else if wanted.iter().any(|w| name.contains(w.as_str()) || w.contains(name.as_str())) {
                1
            } else {
                0
            };
            let year_score = match (year, c.year) {
                (Some(a), Some(b)) if a == b => 2,
                (Some(a), Some(b)) if (a - b).abs() == 1 => 1,
                (Some(_), Some(_)) => return None,
                _ => 0,
            };
            if title_score == 0 && !(only_one && year_score == 2) {
                return None;
            }
            let kind_score = i32::from(is_series_title(&c.title) == series);
            Some((title_score + year_score + kind_score, c))
        })
        // max_by_key se queda con el último empate; se invierte para respetar el orden de la web.
        .rev()
        .max_by_key(|(score, _)| *score)
        .map(|(_, c)| c)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SEARCH: &str = r#"<html><body><ul>
      <li class="se-it">
        <div class="ye-w">2008</div>
        <div class="fa-card"><div class="row movie-card movie-card-1" data-movie-id="867354">
          <div class="mc-title"><a href="/es/film867354.html">El caballero oscuro</a></div>
          <div class="avgrat-box">8,1</div><div class="ratcount-box">158.246</div>
        </div></div>
      </li>
      <li class="se-it">
        <div class="ye-w">2008</div>
        <div class="fa-card"><div class="row movie-card movie-card-1" data-movie-id="111">
          <div class="mc-title"><a href="/es/film111.html">El caballero oscuro: making of</a></div>
          <div class="avgrat-box">--</div>
        </div></div>
      </li>
    </ul></body></html>"#;

    const DETAIL: &str = r#"<html><body>
      <h1 id="main-title"><span itemprop="name">Breaking Bad (Serie de TV)</span></h1>
      <dd itemprop="datePublished">2008</dd>
      <div id="movie-rat-avg" itemprop="ratingValue" content="8.9">8,9</div>
      <span itemprop="ratingCount" content="241035">241.035</span>
    </body></html>"#;

    #[test]
    fn parses_search_cards() {
        let r = parse_search(SEARCH);
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].id, 867354);
        assert_eq!(r[0].title, "El caballero oscuro");
        assert_eq!(r[0].year, Some(2008));
        assert_eq!(r[0].rating, Some(8.1));
        assert_eq!(r[0].votes, Some(158246));
        assert_eq!(r[0].url, "https://www.filmaffinity.com/es/film867354.html");
        assert_eq!(r[1].rating, None);
    }

    #[test]
    fn parses_cards_without_list_wrapper() {
        let html = r#"<div class="movie-card" data-movie-id="5"><div class="mc-title"><a>Dune</a></div>
            <span class="mc-year">2021</span><div class="avg">7,3</div><div class="count">50.000</div></div>"#;
        let r = parse_search(html);
        assert_eq!(r[0].year, Some(2021));
        assert_eq!(r[0].rating, Some(7.3));
    }

    /// Marcado de la búsqueda avanzada tras el cambio de 2026 (según el script de Ant Movie Catalog 5.1).
    const SEARCH_2026: &str = r#"<html><body>
      <div class="fa-card">
        <div class="mc-poster"><a href="https://www.filmaffinity.com/es/film872585.html"><img alt="Oppenheimer"></a></div>
        <div class="mc-info">
          <a class="d-none d-md-inline-block" href="https://www.filmaffinity.com/es/film872585.html" title="Oppenheimer">Oppenheimer</a>
          <span class="mc-year ms-1">2023</span>
          <div class="mt-2 mc-director"><a href="/es/search.php?stype=director&stext=Nolan">Christopher Nolan</a></div>
        </div>
        <div class="fa-avg-rat-box"><div class="avg">7,6</div><div class="count">58.120</div></div>
      </div>
      <div class="fa-card">
        <a class="d-none d-md-inline-block" href="/es/film999.html">Oppenheimer: la historia</a>
        <span class="mc-year ms-1">2023</span>
      </div>
    </body></html>"#;

    #[test]
    fn parses_2026_search_cards() {
        let r = parse_search(SEARCH_2026);
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].id, 872585);
        assert_eq!(r[0].title, "Oppenheimer");
        assert_eq!(r[0].year, Some(2023));
        assert_eq!(r[0].rating, Some(7.6));
        assert_eq!(r[0].votes, Some(58120));
        assert_eq!(r[1].id, 999);
        assert_eq!(r[1].rating, None);
        assert_eq!(best_match(r, &["Oppenheimer"], Some(2023), false).unwrap().id, 872585);
    }

    #[test]
    fn detects_detail_page_and_rate_limit() {
        let html = r#"<html><head><link rel="canonical" href="https://www.filmaffinity.com/es/film123.html"></head></html>"#;
        assert_eq!(detail_id(html), Some(123));
        assert_eq!(detail_id(SEARCH_2026), None);
        assert!(is_rate_limited(r#"<html><head><meta name="description" content="Too many request"></head></html>"#));
        assert!(!is_rate_limited(SEARCH_2026));
    }

    #[test]
    fn parses_detail_page() {
        let d = parse_detail(DETAIL, 42).unwrap();
        assert_eq!(d.title, "Breaking Bad (Serie de TV)");
        assert_eq!(d.year, Some(2008));
        assert_eq!(d.rating, Some(8.9));
        assert_eq!(d.votes, Some(241035));
    }

    #[test]
    fn picks_exact_title_and_year() {
        let m = best_match(parse_search(SEARCH), &["The Dark Knight", "El caballero oscuro"], Some(2008), false).unwrap();
        assert_eq!(m.id, 867354);
    }

    #[test]
    fn rejects_other_years_and_unrelated_titles() {
        assert!(best_match(parse_search(SEARCH), &["El caballero oscuro"], Some(2012), false).is_none());
        assert!(best_match(parse_search(SEARCH), &["Amélie"], Some(2008), false).is_none());
    }

    #[test]
    fn prefers_series_cards_for_series() {
        let c = |id, title: &str| FaMatch { id, url: film_url(id), title: title.into(), year: Some(2016), rating: None, votes: None };
        let list = vec![c(1, "The Office"), c(2, "The Office (Serie de TV)")];
        assert_eq!(best_match(list.clone(), &["The Office"], Some(2016), true).unwrap().id, 2);
        assert_eq!(best_match(list, &["The Office"], Some(2016), false).unwrap().id, 1);
    }

    #[test]
    fn normalizes_titles() {
        assert_eq!(normalize("Amélie (Le fabuleux destin) "), "amelie");
        assert_eq!(normalize("Señor de los Anillos: La Comunidad"), "senor de los anillos la comunidad");
        assert_eq!(normalize("Fast & Furious"), "fast and furious");
    }

    #[test]
    fn builds_urls_and_reads_ids() {
        let u = search_url("El caballero oscuro", Some(2008));
        assert!(u.starts_with("https://www.filmaffinity.com/es/advsearch.php?stext=El+caballero+oscuro&stype%5B%5D=title"));
        assert!(u.ends_with("fromyear=2007&toyear=2009"));
        assert_eq!(film_id("https://www.filmaffinity.com/es/film867354.html"), Some(867354));
        assert_eq!(film_id("https://www.filmaffinity.com/es/advsearch.php?x=1"), None);
    }

    #[test]
    fn reads_ratings_and_votes() {
        assert_eq!(parse_rating("6,2"), Some(6.2));
        assert_eq!(parse_rating("--"), None);
        assert_eq!(parse_rating("7,6 58.120"), Some(7.6));
        assert_eq!(parse_votes("68.397 votos"), Some(68397));
    }
}
