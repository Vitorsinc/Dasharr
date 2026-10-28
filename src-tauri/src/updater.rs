//! Actualización desde las Releases de GitHub: compara la última versión publicada con la instalada,
//! descarga el instalador `-setup.exe`, comprueba su SHA-256 y lo ejecuta en modo pasivo.

use std::cmp::Ordering;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Runtime};

/// Repositorio donde se publican las versiones (debe ser público para descargar sin sesión).
pub const RELEASES_REPO: &str = "Vitorsinc/Dasharr";

#[derive(Deserialize)]
struct GhRelease {
    tag_name: String,
    body: Option<String>,
    assets: Vec<GhAsset>,
}

#[derive(Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub notes: String,
    pub installer_url: String,
    pub checksum_url: Option<String>,
}

fn parse_version(v: &str) -> Option<(u64, u64, u64)> {
    let mut it = v.trim().trim_start_matches('v').split(['.', '-', '+']).map(|p| p.parse::<u64>().ok());
    Some((it.next()??, it.next()??, it.next()??))
}

/// `Greater` si `latest` es más nueva que `current`.
pub fn compare_versions(latest: &str, current: &str) -> Option<Ordering> {
    Some(parse_version(latest)?.cmp(&parse_version(current)?))
}

fn pick_update(release: GhRelease, current: &str) -> Option<UpdateInfo> {
    if compare_versions(&release.tag_name, current)? != Ordering::Greater {
        return None;
    }
    let installer = release.assets.iter().find(|a| a.name.ends_with("-setup.exe"))?;
    let checksum = release.assets.iter().find(|a| a.name == format!("{}.sha256", installer.name));
    Some(UpdateInfo {
        version: release.tag_name.trim_start_matches('v').to_string(),
        notes: release.body.unwrap_or_default(),
        installer_url: installer.browser_download_url.clone(),
        checksum_url: checksum.map(|a| a.browser_download_url.clone()),
    })
}

fn http() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!("Dasharr/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())
}

/// Devuelve la versión nueva si la hay; `None` si ya está al día.
#[tauri::command]
pub async fn check_update<R: Runtime>(app: AppHandle<R>) -> Result<Option<UpdateInfo>, String> {
    let current = app.package_info().version.to_string();
    let url = format!("https://api.github.com/repos/{RELEASES_REPO}/releases/latest");
    let res = http()?.get(url).header("Accept", "application/vnd.github+json").send().await.map_err(|e| e.to_string())?;
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None); // aún no hay versiones publicadas (o el repositorio no es público)
    }
    let release: GhRelease = res.error_for_status().map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
    Ok(pick_update(release, &current))
}

fn allowed(url: &str) -> bool {
    url.starts_with(&format!("https://github.com/{RELEASES_REPO}/releases/download/"))
}

#[tauri::command]
pub async fn install_update<R: Runtime>(app: AppHandle<R>, installer_url: String, checksum_url: Option<String>) -> Result<(), String> {
    if !allowed(&installer_url) || checksum_url.as_deref().is_some_and(|u| !allowed(u)) {
        return Err("dirección de descarga no permitida".into());
    }
    let client = http()?;
    let bytes = client
        .get(&installer_url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;
    if let Some(url) = checksum_url {
        let expected = client.get(url).send().await.map_err(|e| e.to_string())?.text().await.map_err(|e| e.to_string())?;
        let expected = expected.split_whitespace().next().unwrap_or_default().to_ascii_lowercase();
        let actual = format!("{:x}", Sha256::digest(&bytes));
        if expected != actual {
            log::error!("Actualización descartada: el SHA-256 no coincide");
            return Err("el instalador descargado no coincide con su suma de comprobación".into());
        }
    }
    let path = std::env::temp_dir().join(installer_url.rsplit('/').next().unwrap_or("dasharr-setup.exe"));
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    log::info!("Instalando actualización desde {}", installer_url);
    // /P = instalación pasiva de NSIS (solo barra de progreso); /R vuelve a abrir Dasharr al terminar.
    std::process::Command::new(&path).args(["/P", "/R"]).spawn().map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release(tag: &str) -> GhRelease {
        GhRelease {
            tag_name: tag.into(),
            body: Some("notas".into()),
            assets: vec![
                GhAsset { name: "Dasharr_0.2.0_x64-setup.exe".into(), browser_download_url: "https://github.com/x/setup.exe".into() },
                GhAsset { name: "Dasharr_0.2.0_x64-setup.exe.sha256".into(), browser_download_url: "https://github.com/x/sha".into() },
                GhAsset { name: "Dasharr_0.2.0_x64_en-US.msi".into(), browser_download_url: "https://github.com/x/msi".into() },
            ],
        }
    }

    #[test]
    fn compares_semver() {
        assert_eq!(compare_versions("v0.10.0", "0.9.3"), Some(Ordering::Greater));
        assert_eq!(compare_versions("v0.2.0", "0.2.0"), Some(Ordering::Equal));
        assert_eq!(compare_versions("v1.0.0", "1.0.1"), Some(Ordering::Less));
        assert_eq!(compare_versions("nightly", "1.0.0"), None);
    }

    #[test]
    fn picks_setup_exe_only_when_newer() {
        let u = pick_update(release("v0.2.0"), "0.1.0").unwrap();
        assert_eq!(u.version, "0.2.0");
        assert_eq!(u.installer_url, "https://github.com/x/setup.exe");
        assert_eq!(u.checksum_url.as_deref(), Some("https://github.com/x/sha"));
        assert!(pick_update(release("v0.2.0"), "0.2.0").is_none());
    }

    #[test]
    fn only_downloads_from_own_releases() {
        assert!(allowed(&format!("https://github.com/{RELEASES_REPO}/releases/download/v0.2.0/a.exe")));
        assert!(!allowed("https://evil.example/releases/download/a.exe"));
    }
}
