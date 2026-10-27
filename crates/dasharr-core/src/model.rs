use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ServiceKind {
    Radarr,
    Sonarr,
    Prowlarr,
    Bazarr,
    Qbittorrent,
}

impl ServiceKind {
    pub const ALL: [ServiceKind; 5] = [
        ServiceKind::Radarr,
        ServiceKind::Sonarr,
        ServiceKind::Prowlarr,
        ServiceKind::Bazarr,
        ServiceKind::Qbittorrent,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            ServiceKind::Radarr => "radarr",
            ServiceKind::Sonarr => "sonarr",
            ServiceKind::Prowlarr => "prowlarr",
            ServiceKind::Bazarr => "bazarr",
            ServiceKind::Qbittorrent => "qbittorrent",
        }
    }

    pub fn parse(s: &str) -> Option<ServiceKind> {
        ServiceKind::ALL.into_iter().find(|k| k.as_str() == s)
    }

    /// Ruta usada para comprobar si una dirección responde.
    pub fn probe_path(self) -> &'static str {
        match self {
            ServiceKind::Radarr | ServiceKind::Sonarr | ServiceKind::Prowlarr => "/ping",
            ServiceKind::Bazarr => "/api/system/status",
            ServiceKind::Qbittorrent => "/api/v2/app/version",
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceConfig {
    pub local_url: Option<String>,
    pub external_url: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

impl ServiceConfig {
    pub fn local(&self) -> Option<&str> {
        self.local_url.as_deref().map(str::trim).filter(|s| !s.is_empty())
    }
    pub fn external(&self) -> Option<&str> {
        self.external_url.as_deref().map(str::trim).filter(|s| !s.is_empty())
    }
    pub fn is_configured(&self) -> bool {
        self.enabled && (self.local().is_some() || self.external().is_some())
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceSecrets {
    pub api_key: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub proxy_username: Option<String>,
    pub proxy_password: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Route {
    Local,
    Remote,
    Offline,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FilePart {
    pub field: String,
    pub filename: String,
    pub base64: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "lowercase")]
pub enum ApiBody {
    Json(Value),
    Form(Vec<(String, String)>),
    Multipart { fields: Vec<(String, String)>, files: Vec<FilePart> },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ApiRequest {
    #[serde(default = "default_get")]
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub query: Vec<(String, String)>,
    #[serde(default)]
    pub body: Option<ApiBody>,
}

fn default_get() -> String {
    "GET".into()
}

impl ApiRequest {
    pub fn get(path: impl Into<String>) -> Self {
        ApiRequest { method: "GET".into(), path: path.into(), query: vec![], body: None }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ApiResponse {
    pub status: u16,
    pub body: Value,
}
