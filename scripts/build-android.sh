#!/usr/bin/env bash
# Compila la APK de Android (solo arm64, la de cualquier móvil actual) y la deja en dist-android/ como
# Dasharr_<versión>_android.apk (o Dasharr.Dev_… con DASHARR_ANDROID_DEV=1), junto a su .sha256.
#
# Firma: con el secreto DASHARR_ANDROID_KEYSTORE (el almacén .jks en base64) sale la APK de release firmada
# siempre con la misma clave, así que se puede actualizar encima. Sin él sale la de depuración, firmada con
# una clave que cambia en cada máquina: sirve para probar, pero cada versión pide desinstalar la anterior.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
version="$(node -p "require('./package.json').version")"
name="Dasharr"
[ "${DASHARR_ANDROID_DEV:-}" = "1" ] && name="Dasharr.Dev"
mkdir -p dist-android

if [ -n "${DASHARR_ANDROID_KEYSTORE:-}" ]; then
  ks="$RUNNER_TEMP/dasharr.jks"
  echo "$DASHARR_ANDROID_KEYSTORE" | base64 -d > "$ks"
  export DASHARR_KEYSTORE="$ks"
  # La clave del almacén no es el secreto: lo es el propio archivo, que solo está en los secretos del repositorio.
  export DASHARR_KEYSTORE_PASSWORD="dasharr-android" DASHARR_KEY_ALIAS="dasharr" DASHARR_KEY_PASSWORD="dasharr-android"
  npx tauri android build --apk --target aarch64
  apk="$(find src-tauri/gen/android/app/build/outputs/apk -name '*-release.apk' | head -n1)"
elif [ "${DASHARR_RELEASE:-}" = "1" ]; then
  # Una versión publicada no sale con la firma de depuración: luego no se podría actualizar encima.
  echo "::warning::Sin el secreto DASHARR_ANDROID_KEYSTORE: esta versión se publica sin APK de Android."
  exit 0
else
  echo "::warning::Sin el secreto DASHARR_ANDROID_KEYSTORE: se publica la APK de depuración."
  npx tauri android build --apk --target aarch64 --debug
  apk="$(find src-tauri/gen/android/app/build/outputs/apk -name '*-debug.apk' | head -n1)"
fi

test -n "$apk"
out="dist-android/${name}_${version}_android.apk"
cp "$apk" "$out"
sha256sum "$out" | cut -d' ' -f1 > "$out.sha256"
ls -l dist-android
