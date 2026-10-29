use crate::error::ApiError;
use url::Url;

/// Une una URL base (que puede tener ruta, p. ej. `https://x.com/radarr/`) con una ruta de API.
pub fn join_url(base: &str, path: &str) -> Result<Url, ApiError> {
    let base = base.trim();
    let with_scheme = if base.contains("://") { base.to_string() } else { format!("http://{base}") };
    let mut url = Url::parse(&with_scheme).map_err(|e| ApiError::Network { message: format!("URL no válida: {e}") })?;
    let prefix = url.path().trim_end_matches('/').to_string();
    let suffix = path.trim_start_matches('/');
    url.set_path(&format!("{prefix}/{suffix}"));
    Ok(url)
}
