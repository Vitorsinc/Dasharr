# Dasharr

Dashboard de escritorio para Windows que reúne Radarr, Sonarr, Prowlarr, Bazarr, qBittorrent y Plex, inspirado en nzb360.

## Instalar

Descarga el instalador `.exe` de la última versión en [Releases](../../releases) y ejecútalo.
Las versiones publicadas van firmadas (ver [Code signing policy](#code-signing-policy)).

## Desarrollo

```bash
npm install
npm run tauri dev     # app en modo desarrollo
npm test              # pruebas de la interfaz
cargo test -p dasharr-core   # pruebas del núcleo de red
```

Especificación: `docs/superpowers/specs/2026-10-27-dasharr-mvp-design.md`.

### Ramas

- `dev`: aquí llegan todos los cambios (cada uno con su PR contra `dev`) y aquí se prueban.
- `master`: solo lo revisado y aprobado, mediante un PR `dev → master`. Las versiones (`vX.Y.Z`) se etiquetan siempre en `master`.

## Primeros pasos

1. Abre **Ajustes**.
2. Para cada servicio rellena la **dirección local** (por ejemplo `http://192.168.1.50:7878`) y, si accedes desde fuera de casa, la **dirección externa** (por ejemplo `https://radarr.midominio.com`).
3. Pega la **API key** (en Radarr, Sonarr, Prowlarr y Bazarr está en *Settings → General*). En qBittorrent usa tu usuario y contraseña de la interfaz web. En Plex pulsa **Iniciar sesión con Plex** y elige tu servidor.
4. Si tu proxy inverso pide usuario y contraseña, despliega *Autenticación del proxy*.
5. Pulsa **Probar conexión** y después **Guardar**.

Dasharr usa la dirección local cuando responde y cambia sola a la externa cuando no. Las API keys y contraseñas se guardan en el Administrador de credenciales de Windows.

## Dasharr Dev: la versión de prueba, instalada junto a Dasharr

Cada cambio que entra en la rama `dev` se compila solo y se publica como la Release
[`dev-latest`](https://github.com/Vitorsinc/Dasharr/releases/tag/dev-latest) (marcada como versión preliminar).
Esa compilación se llama **Dasharr Dev**: tiene su propio nombre, carpeta, acceso directo y configuración,
así que convive con Dasharr sin tocarlo.

- Para empezar, instala una vez el `-setup.exe` de esa Release. La primera vez que se abre copia la
  configuración de Dasharr (servicios y preferencias); las API keys y contraseñas son compartidas.
- Después se actualiza sola: mira cada 10 minutos si hay un cambio nuevo, avisa y se reinstala
  (con 30 segundos para dejarlo para más tarde). Dasharr sigue esperando a las versiones publicadas.

## Probar cambios sin reinstalar (modo desarrollo)

Requisitos (una sola vez): `winget install Git.Git OpenJS.NodeJS.LTS Rustlang.Rustup` y las
herramientas de compilación de C++ (`winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`).

Después, doble clic en `scripts\dasharr-dev.bat`: baja los últimos cambios de `dev` y abre
Dasharr. Los cambios de pantallas se ven al momento. Usa la misma configuración que la app instalada.

## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org)

Política de firma de código: se firman solo los instaladores de las versiones publicadas
([Releases](https://github.com/Vitorsinc/Dasharr/releases), las que crea `.github/workflows/release.yml`),
compilados por GitHub Actions a partir de este repositorio. La versión de prueba «Dasharr Dev» no se firma.

Equipo:

- Autores (committers) y revisores: [Vitorsinc](https://github.com/Vitorsinc).
  Los cambios llegan por pull request a `dev` y solo pasan a `master` cuando Vitorsinc los revisa.
- Aprobadores (cada firma se aprueba a mano en SignPath): [Vitorsinc](https://github.com/Vitorsinc).

Privacidad: este programa no envía información a otros sistemas en red salvo los que el usuario
configura o pide expresamente; el detalle está en [PRIVACY.md](PRIVACY.md).

## Licencia

[MIT](LICENSE).
