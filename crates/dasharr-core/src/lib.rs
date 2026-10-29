//! Núcleo de red de Dasharr: resolución local/remota, autenticación y peticiones.
mod client;
mod error;
pub mod filmaffinity;
mod model;
pub mod plex;
mod registry;
pub mod unit3d;
mod url;

pub use client::ServiceClient;
pub use error::ApiError;
pub use model::*;
pub use registry::Registry;
pub use url::join_url;
