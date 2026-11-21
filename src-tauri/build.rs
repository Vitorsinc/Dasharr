fn main() {
    // El identificador de Google se mete en el programa al compilar (ver docs/google.md).
    println!("cargo:rerun-if-env-changed=DASHARR_GOOGLE_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=DASHARR_GOOGLE_CLIENT_SECRET");
    tauri_build::build()
}
