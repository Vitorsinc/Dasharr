//! Protocolo `dasharr-img://<servicio>/<ruta>`: carga imágenes que requieren autenticación (pósters de Radarr/Sonarr).
use dasharr_core::ServiceKind;
use tauri::http::{Request, Response, StatusCode};
use tauri::{Manager, Runtime, UriSchemeContext, UriSchemeResponder};

use crate::state::AppState;

pub const SCHEME: &str = "dasharr-img";

fn not_found() -> Response<Vec<u8>> {
    Response::builder().status(StatusCode::NOT_FOUND).body(Vec::new()).unwrap()
}

pub fn handle<R: Runtime>(ctx: UriSchemeContext<'_, R>, request: Request<Vec<u8>>, responder: UriSchemeResponder) {
    let app = ctx.app_handle().clone();
    let uri = request.uri().clone();
    tauri::async_runtime::spawn(async move {
        let raw = uri.path().trim_start_matches('/');
        // En Windows la URL es http://dasharr-img.localhost/<servicio>/<ruta>; en otros sistemas dasharr-img://localhost/<servicio>/<ruta>.
        let (service, rest) = raw.split_once('/').unwrap_or((raw, ""));
        let Some(kind) = ServiceKind::parse(service) else { return responder.respond(not_found()) };
        let mut path = format!("/{rest}");
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
