# pw2xray

Infraestructura compartida entre los repos de regresión Playwright de Inteligo
(hoy: `PW_SAB`, `sab-publica`). No es un repo de tests — es la lógica de
integración con Xray/Jira y utilidades de CI que antes se copiaba y pegaba
entre repos.

Se distribuye como **fuente TypeScript sin build**, consumida vía `tsx` en el
repo que la importa (no hay paso de compilación ni registro npm privado).

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
  "pw2xray": "git+https://github.com/alcalacar/pw2xray.git#v0.1.0"
}
```

Y wrappers finos en `scripts/` del repo consumidor (2-5 líneas cada uno) que
llaman a las funciones exportadas, pasando la configuración propia de ese repo
(project key de Jira ya viene de `JIRA_PROJECT_KEY` en `.env`, no hace falta
pasarlo a mano). Ver `scripts/check-secrets.ts` y `scripts/upload-to-xray.ts`
en `sab-publica` para el ejemplo de referencia.

Repos consumidores actuales: `PW_SAB` (Custodia SAB, BDD) y `sab-publica` (web
pública inteligosab.com). Ambos usan además las primitivas de `src/xray.ts`
directamente en scripts propios (import de features Cucumber, Test Plans,
verificación contra Jira) que no forman parte de este paquete por ser lógica
específica de cada repo.

## Versionado

Cada cambio que se quiera propagar a los repos consumidores se taggea acá
(`git tag vX.Y.Z`). Actualizar un consumidor es cambiar el `#vX.Y.Z` de su
`package.json` y correr `bun install` — nunca automático, siempre a demanda
del repo consumidor.
