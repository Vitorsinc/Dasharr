use std::collections::HashMap;

use dasharr_core::{Registry, Route, ServiceClient, ServiceKind};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::Mutex;

use crate::settings;

pub const CONNECTION_EVENT: &str = "connection-changed";

#[derive(Default)]
pub struct AppState {
    pub registry: Registry,
    last_routes: Mutex<HashMap<ServiceKind, Option<Route>>>,
}

impl AppState {
    /// Crea los clientes a partir de la configuración guardada.
    pub async fn load<R: Runtime>(&self, app: &AppHandle<R>) {
        let configs = settings::load_configs(app);
        for kind in ServiceKind::ALL {
            let config = configs.get(&kind).cloned().unwrap_or_default();
            self.registry.set(ServiceClient::new(kind, config, settings::load_secrets(kind))).await;
        }
    }

    pub async fn routes(&self) -> HashMap<ServiceKind, Option<Route>> {
        let mut out = HashMap::new();
        for c in self.registry.all().await {
            let route = if c.config().is_configured() { c.route().await } else { None };
            out.insert(c.kind(), route);
        }
        out
    }

    /// Vuelve a comprobar todos los servicios configurados y avisa a la interfaz si algo cambió.
    pub async fn probe_all<R: Runtime>(&self, app: &AppHandle<R>, force_emit: bool) {
        let handles: Vec<_> = self
            .registry
            .all()
            .await
            .into_iter()
            .filter(|c| c.config().is_configured())
            .map(|c| tokio::spawn(async move { c.probe().await }))
            .collect();
        for h in handles {
            let _ = h.await;
        }
        self.emit_if_changed(app, force_emit).await;
    }

    pub async fn emit_if_changed<R: Runtime>(&self, app: &AppHandle<R>, force: bool) {
        let routes = self.routes().await;
        let mut last = self.last_routes.lock().await;
        if force || *last != routes {
            *last = routes.clone();
            let _ = app.emit(CONNECTION_EVENT, &routes);
        }
    }
}
