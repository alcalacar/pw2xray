# pw2xray

Cliente ligero de la API de **Xray Cloud** (el add-on de testing de Jira) para
reportar resultados de **Playwright**: sube ejecuciones JUnit, adjunta
evidencia (screenshots/adjuntos) a cada Test Run, sincroniza escenarios
Cucumber con Jira, y de paso trae un hook de pre-commit para escanear
credenciales hardcodeadas en el diff. Nació para no copiar y pegar esta lógica
entre varios repos de Playwright propios; si te sirve para el tuyo, adelante.

Se distribuye como **fuente TypeScript sin build**, pensada para consumirse
vía `tsx` (no hay paso de compilación todavía — ver el README del repo para el
detalle de qué falta para un build/publish "como se debe").

## Requisitos

- Node 18+ (usa `fetch`/`FormData`/`Blob` globales, sin dependencias de red
  adicionales) o un runtime compatible (Bun).
- Un runtime de TypeScript en el consumidor (`tsx`, `ts-node`, etc.), porque
  hoy se importa el `.ts` fuente directamente.
- Las variables de entorno (`XRAY_CLIENT_ID`, `XRAY_CLIENT_SECRET`,
  `JIRA_PROJECT_KEY`, etc. — ver abajo) deben estar ya cargadas en
  `process.env` **antes** de llamar a estas funciones. La librería no carga
  ningún `.env` por vos (por diseño: no debe decidir eso por el consumidor) —
  si usás `dotenv`, hacé `import "dotenv/config"` en tu propio script antes de
  importar `pw2xray`.

## Qué incluye

- `src/xray.ts` — cliente de la API GraphQL/REST de Xray Cloud (auth, queries,
  import de features Cucumber, export de features, asociación a Test Plans).
- `src/playwright-report.ts` — parseo de `results/results.json` de Playwright
  para extraer evidencia (screenshots, adjuntos de texto/JSON) agrupada por
  título de test, con el mismo formato `"describe › test"` que usa el
  reporter JUnit (necesario para que el título calce con lo que Xray registró
  al importar el XML).
- `src/check-secrets.ts` — hook de pre-commit que escanea el diff staged en
  busca de patrones de credenciales.
- `src/upload-to-xray.ts` — importa un reporte JUnit a Xray (crea una Test
  Execution nueva) y adjunta evidencia a cada Test Run.

## Cómo lo consume un repo

En el `package.json` del repo consumidor, como dependencia git (sin registro
privado configurado todavía; si en algún momento se monta uno, esto pasa a ser
una versión publicada normal):

```json
"devDependencies": {
  "pw2xray": "git+https://github.com/alcalacar/pw2xray.git#v0.1.1"
}
```

Y un wrapper fino en `scripts/` de tu propio repo (2-5 líneas) que llama a la
función exportada, después de cargar tu propio `.env`:

```ts
import "dotenv/config";
import { uploadToXray } from "pw2xray/upload-to-xray";

uploadToXray().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

## Quién lo usa

Hoy lo consumen dos repos propios de regresión Playwright: uno con BDD/Cucumber
sobre un sistema con login, y otro sin login para un sitio público. Ambos usan
además las primitivas de `src/xray.ts` directamente en scripts propios (import
de features Cucumber, Test Plans, verificación contra Jira) que no forman
parte de este paquete por ser lógica específica de cada repo, no genérica.

## Versionado

Cada cambio que se quiera propagar a los repos consumidores se taggea acá
(`git tag vX.Y.Z`, semver). Actualizar un consumidor es cambiar el `#vX.Y.Z` de
su `package.json` y correr `bun install`/`npm install` — nunca automático,
siempre a demanda del repo consumidor.

## Roadmap hacia un publish "de verdad" a npm

Hoy funciona bien como dependencia git entre repos que ya usan `tsx`. Para que
tenga sentido publicarlo en el índice público de npm (audiencia que no
controla su propio toolchain), falta:

- **Build real**: compilar a JS + generar `.d.ts` (hoy se distribuye el `.ts`
  fuente sin compilar, así que solo funciona si el consumidor también corre
  TypeScript directo).
- **Tests**: al menos de la parte sin red (`collectSpecsWithImages`).
- **CI**: typecheck + tests en cada push, y publish automático a npm por tag.

Hasta que eso esté, seguir consumiéndolo como dependencia git.
