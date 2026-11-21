use dasharr_core::{parse_service_configs, ServiceKind};
use serde_json::json;

#[test]
fn unknown_or_broken_services_do_not_hide_the_rest() {
    let raw = json!({
        "radarr": { "enabled": true, "localUrl": "http://192.168.1.2:7878", "externalUrl": null },
        "servicio-del-futuro": { "enabled": true, "localUrl": "http://x", "externalUrl": null },
        "sonarr": "dañado"
    });
    let parsed = parse_service_configs(raw.as_object().unwrap());
    assert_eq!(parsed.len(), 1);
    assert_eq!(
        parsed[&ServiceKind::Radarr].local_url.as_deref(),
        Some("http://192.168.1.2:7878")
    );
}
