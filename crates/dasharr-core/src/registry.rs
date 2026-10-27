use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;

use crate::client::ServiceClient;
use crate::model::ServiceKind;

/// Clientes activos, uno por servicio.
#[derive(Default)]
pub struct Registry {
    clients: RwLock<HashMap<ServiceKind, Arc<ServiceClient>>>,
}

impl Registry {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn set(&self, client: ServiceClient) {
        self.clients.write().await.insert(client.kind(), Arc::new(client));
    }

    pub async fn get(&self, kind: ServiceKind) -> Option<Arc<ServiceClient>> {
        self.clients.read().await.get(&kind).cloned()
    }

    pub async fn all(&self) -> Vec<Arc<ServiceClient>> {
        self.clients.read().await.values().cloned().collect()
    }
}
