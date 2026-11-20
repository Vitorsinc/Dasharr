# Firmar los instaladores con SignPath Foundation (gratis)

Objetivo: que Windows deje de mostrar «Editor desconocido» al instalar Dasharr.

## Lo que ya está hecho en el repositorio

- Licencia MIT (`LICENSE`), política de privacidad (`PRIVACY.md`) y la sección
  «Code signing policy» del README, que SignPath exige.
- `release.yml` compila, sube el instalador sin firmar como artefacto, pide la firma a SignPath,
  espera la aprobación (hasta 3 h), calcula el SHA-256 del instalador **ya firmado** y publica la Release.
- Mientras no existan la variable `SIGNPATH_ORGANIZATION_ID` y el secreto `SIGNPATH_API_TOKEN`,
  las versiones se siguen publicando sin firmar, como antes.
- `.signpath/artifact-configuration.xml`: qué firmar dentro del artefacto (instalador NSIS y MSI).

## Pasos que solo puede hacer el dueño del proyecto

1. Activar la verificación en dos pasos en GitHub (Settings → Password and authentication). Es obligatoria.
2. Pedir la firma gratuita en https://signpath.org/apply (proyecto: https://github.com/Vitorsinc/Dasharr).
3. Cuando SignPath acepte: entrar en https://app.signpath.io, activar también ahí la verificación
   en dos pasos y aceptar las condiciones.
4. En SignPath:
   - Trusted Build Systems → añadir «GitHub.com» y enlazarlo al proyecto.
   - Proyecto con slug `dasharr`, política de firma `release-signing`.
   - Artifact Configurations → pegar el contenido de `.signpath/artifact-configuration.xml`.
   - Users → crear un usuario de CI (submitter) y copiar su API token.
5. En GitHub → Settings → Secrets and variables → Actions:
   - Secret `SIGNPATH_API_TOKEN` = el token del paso anterior.
   - Variable `SIGNPATH_ORGANIZATION_ID` = el Organization ID de SignPath.
   - (Solo si se usaron otros nombres) variables `SIGNPATH_PROJECT_SLUG` y `SIGNPATH_SIGNING_POLICY_SLUG`.

Después, en cada versión: SignPath manda un correo, se pulsa **Approve** y la Release se publica firmada.

## Nota honesta sobre SmartScreen

Con firma, Windows ya muestra el editor («SignPath Foundation») en lugar de «Editor desconocido».
El aviso azul de SmartScreen depende además de la reputación del certificado y del archivo:
puede seguir saliendo unos días o unas descargas después de las primeras versiones firmadas.
