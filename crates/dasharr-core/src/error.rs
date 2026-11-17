use serde::Serialize;

#[derive(Debug, Clone, PartialEq, thiserror::Error, Serialize)]
#[serde(tag = "kind", rename_all = "PascalCase")]
pub enum ApiError {
    #[error("servicio no configurado")]
    NotConfigured,
    #[error("error de red: {message}")]
    Network { message: String },
    #[error("credenciales incorrectas")]
    Unauthorized,
    #[error("error HTTP {status}: {message}")]
    Http { status: u16, message: String },
}

impl ApiError {
    pub fn network(e: impl std::fmt::Display) -> Self {
        ApiError::Network { message: e.to_string() }
    }
}
