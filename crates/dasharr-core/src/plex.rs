//! Cuenta de Plex (plex.tv): inicio de sesión con PIN y lista de servidores de la cuenta.
use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};

use reqwest::{header, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::ApiError;

pub const PLEX_TV: &str = "https://plex.tv";
pub const PLEX_CLIENTS: &str = "https://clients.plex.tv";
const PRODUCT: &str = "Dasharr";

/// Cabeceras con las que Plex identifica la aplicación. Sin ellas plex.tv rechaza el PIN y el servidor responde en XML.
pub fn identify(req: reqwest::RequestBuilder, client_id: Option<&str>) -> reqwest::RequestBuilder {
    req.header(header::ACCEPT, "application/json")
        .header("X-Plex-Product", PRODUCT)
        .header("X-Plex-Version", env!("CARGO_PKG_VERSION"))
        .header("X-Plex-Client-Identifier", client_id.unwrap_or(PRODUCT))
}

/// Identificador aleatorio para este equipo. Se genera una vez y se guarda con el token.
pub fn new_client_id() -> String {
    let part = || RandomState::new().build_hasher().finish();
    format!("dasharr-{:016x}{:016x}", part(), part())
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pin {
    pub id: u64,
    pub code: String,
}

/// Servidor de la cuenta, con las direcciones que Plex conoce y el token para hablar con él.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlexServer {
    pub id: String,
    pub name: String,
    pub owned: bool,
    pub local_url: Option<String>,
    pub external_url: Option<String>,
    #[serde(skip)]
    pub token: String,
}

pub struct PlexAccount {
    http: reqwest::Client,
    client_id: String,
    plex_tv: String,
    clients: String,
}

fn check(status: StatusCode, body: &str) -> Result<(), ApiError> {
    if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        return Err(ApiError::Unauthorized);
    }
    if !status.is_success() {
        return Err(ApiError::Http {
            status: status.as_u16(),
            message: body.chars().take(300).collect(),
        });
    }
    Ok(())
}

impl PlexAccount {
    pub fn new(client_id: impl Into<String>) -> Self {
        Self::with_hosts(client_id, PLEX_TV, PLEX_CLIENTS)
    }

    /// Para pruebas: otras direcciones en vez de plex.tv.
    pub fn with_hosts(client_id: impl Into<String>, plex_tv: &str, clients: &str) -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .user_agent(concat!("Dasharr/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("cliente HTTP");
        PlexAccount {
            http,
            client_id: client_id.into(),
            plex_tv: plex_tv.into(),
            clients: clients.into(),
        }
    }

    async fn json(&self, req: reqwest::RequestBuilder) -> Result<Value, ApiError> {
        let res = identify(req, Some(&self.client_id))
            .send()
            .await
            .map_err(ApiError::network)?;
        let status = res.status();
        let text = res.text().await.map_err(ApiError::network)?;
        check(status, &text)?;
        serde_json::from_str(&text)
            .map_err(|e| ApiError::network(format!("respuesta de Plex no válida: {e}")))
    }

    pub async fn create_pin(&self) -> Result<Pin, ApiError> {
        let v = self
            .json(
                self.http
                    .post(format!("{}/api/v2/pins", self.plex_tv))
                    .query(&[("strong", "true")]),
            )
            .await?;
        serde_json::from_value(v)
            .map_err(|e| ApiError::network(format!("PIN de Plex no válido: {e}")))
    }

    /// Página de Plex donde el usuario acepta el inicio de sesión.
    pub fn auth_url(&self, pin: &Pin) -> String {
        let mut url = url::Url::parse("https://app.plex.tv/auth").expect("URL fija");
        let params: String = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("clientID", &self.client_id)
            .append_pair("code", &pin.code)
            .append_pair("context[device][product]", PRODUCT)
            .finish();
        url.set_fragment(Some(&format!("?{params}")));
        url.to_string()
    }

    /// Token de la cuenta cuando el usuario ya ha aceptado; `None` mientras tanto.
    pub async fn check_pin(&self, id: u64) -> Result<Option<String>, ApiError> {
        let v = self
            .json(self.http.get(format!("{}/api/v2/pins/{id}", self.plex_tv)))
            .await?;
        Ok(v.get("authToken")
            .and_then(Value::as_str)
            .filter(|t| !t.is_empty())
            .map(String::from))
    }

    /// Servidores Plex a los que tiene acceso la cuenta.
    pub async fn servers(&self, token: &str) -> Result<Vec<PlexServer>, ApiError> {
        let req = self
            .http
            .get(format!("{}/api/v2/resources", self.clients))
            .query(&[("includeHttps", "1"), ("includeRelay", "0")])
            .header("X-Plex-Token", token);
        let v = self.json(req).await?;
        Ok(parse_servers(&v))
    }

    /// Dueño de la cuenta, amigos y usuarios de casa, con su avatar. `api/users` solo responde en XML.
    pub async fn users(&self, token: &str) -> Result<Vec<PlexUser>, ApiError> {
        let me = self.json(self.http.get(format!("{}/api/v2/user", self.plex_tv)).header("X-Plex-Token", token)).await?;
        let mut out: Vec<PlexUser> = serde_json::from_value(me).into_iter().collect();
        let res = identify(self.http.get(format!("{}/api/users/", self.plex_tv)), Some(&self.client_id))
            .header(header::ACCEPT, "application/xml")
            .header("X-Plex-Token", token)
            .send()
            .await
            .map_err(ApiError::network)?;
        let status = res.status();
        let text = res.text().await.map_err(ApiError::network)?;
        check(status, &text)?;
        out.extend(parse_users_xml(&text));
        Ok(out)
    }
}

/// Usuario de Plex con su avatar (`thumb`, una URL pública de plex.tv).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlexUser {
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub thumb: Option<String>,
}

fn unescape(v: &str) -> String {
    v.replace("&quot;", "\"").replace("&apos;", "'").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
}

/// Atributos `username`, `title` y `thumb` de cada `<User …>` de `plex.tv/api/users`.
pub fn parse_users_xml(xml: &str) -> Vec<PlexUser> {
    xml.split("<User ")
        .skip(1)
        .map(|tag| {
            let tag = tag.split('>').next().unwrap_or_default();
            let attr = |name: &str| {
                let start = tag.find(&format!(" {name}=\"")).or_else(|| tag.starts_with(&format!("{name}=\"")).then_some(0))?;
                let rest = &tag[start..];
                let rest = &rest[rest.find('"')? + 1..];
                let value = unescape(&rest[..rest.find('"')?]);
                (!value.is_empty()).then_some(value)
            };
            PlexUser { username: attr("username"), title: attr("title"), thumb: attr("thumb") }
        })
        .collect()
}

/// Elige una dirección local (IP sin plex.direct, que algunos routers bloquean) y una externa por servidor.
pub fn parse_servers(v: &Value) -> Vec<PlexServer> {
    let empty = vec![];
    let list = v.as_array().unwrap_or(&empty);
    list.iter()
        .filter(|r| {
            r.get("provides")
                .and_then(Value::as_str)
                .is_some_and(|p| p.split(',').any(|x| x == "server"))
        })
        .filter_map(|r| {
            let s = |k: &str| r.get(k).and_then(Value::as_str).map(String::from);
            let conns = r
                .get("connections")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let flag = |c: &Value, k: &str| c.get(k).and_then(Value::as_bool).unwrap_or(false);
            let local_url = conns
                .iter()
                .filter(|c| flag(c, "local") && !flag(c, "relay"))
                .find_map(|c| {
                    let addr = c.get("address").and_then(Value::as_str)?;
                    let port = c.get("port").and_then(Value::as_u64).unwrap_or(32400);
                    (!addr.contains(':')).then(|| format!("http://{addr}:{port}"))
                });
            let external_url = conns
                .iter()
                .find(|c| !flag(c, "local") && !flag(c, "relay"))
                .and_then(|c| c.get("uri").and_then(Value::as_str))
                .map(String::from);
            Some(PlexServer {
                id: s("clientIdentifier")?,
                name: s("name").unwrap_or_else(|| "Plex".into()),
                owned: r.get("owned").and_then(Value::as_bool).unwrap_or(false),
                local_url,
                external_url,
                token: s("accessToken")?,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn client_ids_are_unique() {
        let a = new_client_id();
        assert_eq!(a.len(), "dasharr-".len() + 32);
        assert_ne!(a, new_client_id());
    }

    #[test]
    fn auth_url_carries_client_and_code() {
        let acc = PlexAccount::new("abc");
        let url = acc.auth_url(&Pin {
            id: 1,
            code: "XYZ".into(),
        });
        assert!(
            url.starts_with("https://app.plex.tv/auth#?clientID=abc&code=XYZ&context"),
            "{url}"
        );
    }

    #[test]
    fn reads_users_from_xml() {
        let xml = r#"<?xml version="1.0"?><MediaContainer><User id="1" title="Ana" username="ana_p" thumb="https://plex.tv/users/a/avatar?c=1&amp;x=2" home="0"><Server/></User><User id="2" title="Peque" username="" thumb="https://plex.tv/users/b/avatar"/></MediaContainer>"#;
        let users = parse_users_xml(xml);
        assert_eq!(users.len(), 2);
        assert_eq!(users[0].username.as_deref(), Some("ana_p"));
        assert_eq!(users[0].thumb.as_deref(), Some("https://plex.tv/users/a/avatar?c=1&x=2"));
        assert_eq!(users[1].username, None);
        assert_eq!(users[1].title.as_deref(), Some("Peque"));
    }

    #[test]
    fn picks_local_ip_and_remote_uri() {
        let v = json!([
            {"name": "Mi Plex", "provides": "server", "clientIdentifier": "m1", "owned": true, "accessToken": "tok",
             "connections": [
                {"local": true, "relay": false, "address": "192.168.1.50", "port": 32400, "uri": "https://192-168-1-50.x.plex.direct:32400"},
                {"local": false, "relay": true, "address": "1.2.3.4", "port": 8443, "uri": "https://relay"},
                {"local": false, "relay": false, "address": "80.1.2.3", "port": 32400, "uri": "https://80-1-2-3.x.plex.direct:32400"}
             ]},
            {"name": "Mi móvil", "provides": "client,player", "clientIdentifier": "p1", "accessToken": "t2", "connections": []}
        ]);
        let servers = parse_servers(&v);
        assert_eq!(servers.len(), 1);
        let s = &servers[0];
        assert_eq!(s.local_url.as_deref(), Some("http://192.168.1.50:32400"));
        assert_eq!(
            s.external_url.as_deref(),
            Some("https://80-1-2-3.x.plex.direct:32400")
        );
        assert_eq!(s.token, "tok");
        assert!(s.owned);
    }
}
