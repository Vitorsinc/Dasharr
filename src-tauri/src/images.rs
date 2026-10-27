//! Protocolo `dasharr-img://<servicio>/<ruta>`: carga imágenes que requieren autenticación (pósters de Radarr/Sonarr).
use dasharr_core::ServiceKind;
use tauri::http::{Request, Response, StatusCode};
use tauri::{Manager, Runtime, UriSchemeContext, UriSchemeResponder};

use crate::state::AppState;

pub const SCHEME: &str = "dasharr-img";

fn not_found() -> Response<Vec<u8>> {
    Response::builder().status(StatusCode::NOT_FOUND).body(Vec::new()).unwrap()
}

/// La interfaz genera la URL con `convertFileSrc`, que codifica la ruta entera (las `/` llegan como `%2F`).
/// En Windows queda http://dasharr-img.localhost/<servicio%2Fruta>; en otros sistemas dasharr-img://localhost/<...>.
fn parse_path(raw: &str) -> Option<(String, String)> {
    let decoded = percent_encoding::percent_decode_str(raw.trim_start_matches('/')).decode_utf8().ok()?;
    let (service, rest) = decoded.split_once('/')?;
    Some((service.to_string(), format!("/{rest}")))
}

pub fn handle<R: Runtime>(ctx: UriSchemeContext<'_, R>, request: Request<Vec<u8>>, responder: UriSchemeResponder) {
    let app = ctx.app_handle().clone();
    let uri = request.uri().clone();
    tauri::async_runtime::spawn(async move {
        let Some((service, mut path)) = parse_path(uri.path()) else { return responder.respond(not_found()) };
        let Some(kind) = ServiceKind::parse(&service) else { return responder.respond(not_found()) };
        if let Some(q) = uri.query() {
            path.push('?');
            path.push_str(q);
        }
        let state = app.state::<AppState>();
        let Some(client) = state.registry.get(kind).await else { return responder.respond(not_found()) };
        match client.bytes(&path).await {
            Ok((bytes, ctype)) => responder.respond(
                Response::builder()
                    .header("Content-Type", ctype)
                    .header("Cache-Control", "max-age=86400")
                    .body(bytes)
                    .unwrap(),
            ),
            Err(_) => responder.respond(not_found()),
        }
    });
}

#[cfg(test)]
mod tests {
    use super::parse_path;

    #[test]
    fn decodes_encoded_path() {
        assert_eq!(
            parse_path("/radarr%2Fapi%2Fv3%2Fmediacover%2F3%2Fposter-500.jpg"),
            Some(("radarr".into(), "/api/v3/mediacover/3/poster-500.jpg".into()))
        );
        assert_eq!(parse_path("/sonarr/api/v3/x.jpg"), Some(("sonarr".into(), "/api/v3/x.jpg".into())));
        assert_eq!(parse_path("/radarr"), None);
    }
}
