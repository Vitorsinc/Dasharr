//! Núcleo de red de Dasharr: resolución local/remota, autenticación y peticiones.
mod client;
mod error;
mod model;
pub mod plex;
mod registry;
mod url;

pub use client::ServiceClient;
pub use error::ApiError;
pub use model::*;
pub use registry::Registry;
pub use url::join_url;
