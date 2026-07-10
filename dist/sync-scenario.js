"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncScenario = syncScenario;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const xray_1 = require("./xray");
const SCENARIO_RE = /^\s*Scenario(?: Outline)?:\s*(.+?)\s*$/;
const BLOCK_START_RE = /^\s*(@\S.*|Scenario(?: Outline)?:.*)$/;
function extractFeatureName(lines) {
    const line = lines.find((l) => /^\s*Feature:/.test(l));
    if (!line)
        throw new Error("No se encontró una línea 'Feature:' en el archivo.");
    return line.replace(/^\s*Feature:\s*/, "").trim();
}
// Gherkin no permite tags sobre "Background:" (solo sobre Feature/Scenario/Examples), así
// que a diferencia de los Scenarios no hay forma de tagear el Background para que Xray
// reutilice la misma Precondition entre distintos escenarios de un mismo archivo -- cada
// import de un archivo con Background crea/actualiza una Precondition (una sola vez por
// request, ya que va una sola copia del Background en el temporal).
function extractBackground(lines) {
    const start = lines.findIndex((l) => /^\s*Background:/.test(l));
    if (start === -1)
        return null;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (BLOCK_START_RE.test(lines[i])) {
            end = i;
            break;
        }
    }
    const block = lines.slice(start, end);
    while (block.length && block[block.length - 1].trim() === "")
        block.pop();
    return block.join("\n");
}
function findScenarioBlock(lines, scenarioName) {
    let scenarioLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(SCENARIO_RE);
        if (m && m[1] === scenarioName) {
            scenarioLineIdx = i;
            break;
        }
    }
    if (scenarioLineIdx === -1) {
        throw new Error(`No se encontró el Scenario "${scenarioName}" en el archivo.`);
    }
    if (/Scenario Outline:/.test(lines[scenarioLineIdx])) {
        throw new Error(`"${scenarioName}" es un Scenario Outline -- este helper solo soporta Scenario simple por ahora.`);
    }
    let tagLineIdx = scenarioLineIdx - 1;
    const existingTags = [];
    while (tagLineIdx >= 0 && /^\s*@\S/.test(lines[tagLineIdx])) {
        existingTags.unshift(lines[tagLineIdx].trim());
        tagLineIdx--;
    }
    if (existingTags.some((t) => t.startsWith("@TEST_"))) {
        throw new Error(`"${scenarioName}" ya tiene un tag @TEST_ (${existingTags.join(" ")}) -- no lo toco, revisar a mano.`);
    }
    let end = lines.length;
    for (let i = scenarioLineIdx + 1; i < lines.length; i++) {
        if (BLOCK_START_RE.test(lines[i])) {
            end = i;
            break;
        }
    }
    const block = lines.slice(scenarioLineIdx, end);
    while (block.length && block[block.length - 1].trim() === "")
        block.pop();
    // Texto de pasos esperado (sin la línea "Scenario:"), para comparar contra el gherkin
    // que Xray devuelve por Test -- ese campo no incluye la línea de nombre del escenario.
    const stepsText = block
        .slice(1)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#"))
        .join("\n");
    return { scenarioLineIdx, block: block.join("\n"), stepsText };
}
// Automatiza el flujo import -> matchear -> tag-back que de otra forma se hace a mano:
// extrae uno o más escenarios SIN tagear de un .feature real, los importa a Xray en un solo
// request como Tests tipo Cucumber, verifica por CONTENIDO (no por orden) que cada Test
// devuelto corresponde al escenario esperado, tagea el archivo real con las keys nuevas, y
// opcionalmente reemplaza Tests viejos por los nuevos en un Test Plan.
//
// Por qué se importan todos los escenarios de un archivo JUNTOS en un solo request, y no uno
// a la vez: escenarios sin tag muy similares entre sí (mismo Feature/Background, vocabulario
// de pasos parecido) importados de a uno pueden matchear el segundo import contra el Test que
// acaba de crear el primero en vez de crear uno nuevo -- sobrescribe silenciosamente el
// contenido de un escenario con el de otro bajo la misma key. Importar todos juntos evita ese
// patrón de colisión, y la verificación por contenido de abajo es la red de seguridad que lo
// detectaría de todos modos si llegara a pasar.
//
// Solo soporta "Scenario:" simple, no "Scenario Outline:" (con Examples) -- el gherkin que
// Xray devuelve para un Outline no es directamente comparable línea a línea de la misma forma.
//
// Lo que NO hace: agregar comentarios de deprecación ni el link "Relates" entre cada Test
// viejo y el nuevo correspondiente -- eso queda para hacerlo aparte.
async function syncScenario(token, options) {
    const { featurePath, projectKey, scenarios, testPlanIssueId } = options;
    const scenarioNames = Object.keys(scenarios);
    if (scenarioNames.length === 0)
        throw new Error("El mapa de escenarios está vacío.");
    const original = fs_1.default.readFileSync(featurePath, "utf8");
    const lines = original.split("\n");
    const featureName = extractFeatureName(lines);
    const background = extractBackground(lines);
    const targets = scenarioNames.map((name) => ({ name, ...findScenarioBlock(lines, name) }));
    // Nombre único por corrida -- reusar el mismo nombre de archivo temporal entre imports
    // separados hace que Xray trate el nuevo contenido como una actualización del Test ya
    // asociado a ese nombre, sin importar que el escenario sea completamente distinto.
    const tmpFile = path_1.default.join(path_1.default.dirname(featurePath), `_tmp_sync_${Date.now()}_${Math.random().toString(36).slice(2)}.feature`);
    const tmpContent = [`Feature: ${featureName}`, "", background, background ? "" : null, ...targets.map((t) => t.block)]
        .filter((l) => l !== null)
        .join("\n\n") + "\n";
    fs_1.default.writeFileSync(tmpFile, tmpContent, "utf8");
    try {
        const result = await (0, xray_1.importFeature)(token, projectKey, tmpFile);
        if (result.errors?.length) {
            throw new Error(`Xray devolvió errores: ${JSON.stringify(result.errors)}`);
        }
        const created = result.updatedOrCreatedTests || [];
        if (created.length !== targets.length) {
            throw new Error(`Se esperaban ${targets.length} Tests creados/actualizados, llegaron ${created.length}. ` +
                `No se toca el .feature real -- revisar manualmente. Respuesta completa: ${JSON.stringify(result)}`);
        }
        // Verificación por CONTENIDO (no por orden): confirmar que cada Test devuelto tiene
        // exactamente el gherkin de UN escenario local, sin ambigüedad ni colisiones.
        const data = await (0, xray_1.graphql)(token, `query($jql: String!) {
				getTests(jql: $jql, limit: 50) {
					results { issueId jira(fields: ["key"]) gherkin }
				}
			}`, { jql: `key in (${created.map((c) => c.key).join(",")})` });
        const remoteTests = data.getTests.results;
        const matches = new Map();
        for (const target of targets) {
            const candidates = remoteTests.filter((rt) => (rt.gherkin || "").trim() === target.stepsText.trim());
            if (candidates.length !== 1) {
                throw new Error(`Verificación falló para "${target.name}": ${candidates.length} Test(s) remoto(s) coinciden ` +
                    `exactamente con su contenido esperado (se esperaba 1). No se toca el .feature real -- revisar a mano. ` +
                    `Keys devueltas por el import: ${created.map((c) => c.key).join(", ")}`);
            }
            matches.set(target.name, { key: candidates[0].jira.key, issueId: candidates[0].issueId });
        }
        // Ningún Test remoto debe haber quedado matcheado a más de un escenario local.
        const usedKeys = [...matches.values()].map((m) => m.key);
        if (new Set(usedKeys).size !== usedKeys.length) {
            throw new Error(`Colisión: dos escenarios locales matchearon la misma key remota (${usedKeys.join(", ")}).`);
        }
        // Tag-back en el archivo real -- de abajo hacia arriba para no invalidar índices.
        const insertions = targets.map((t) => {
            const indent = lines[t.scenarioLineIdx].match(/^(\s*)/)[1];
            return { atIndex: t.scenarioLineIdx, text: `${indent}@TEST_${matches.get(t.name).key}` };
        });
        insertions.sort((a, b) => b.atIndex - a.atIndex);
        const newLines = [...lines];
        for (const { atIndex, text } of insertions)
            newLines.splice(atIndex, 0, text);
        fs_1.default.writeFileSync(featurePath, newLines.join("\n"), "utf8");
        // Test Plan: swap de cada Test deprecado por su Cucumber nuevo (si se pasó testPlanIssueId).
        if (testPlanIssueId) {
            for (const target of targets) {
                const deprecatesKey = scenarios[target.name];
                const { issueId: newIssueId } = matches.get(target.name);
                if (!deprecatesKey) {
                    await (0, xray_1.addTestsToTestPlan)(token, testPlanIssueId, [newIssueId]);
                    continue;
                }
                const oldTest = await (0, xray_1.getTestByKey)(token, deprecatesKey);
                if (!oldTest) {
                    console.warn(`[WARN] No se encontró ${deprecatesKey} en Xray -- no se actualiza el Test Plan.`);
                    continue;
                }
                await (0, xray_1.addTestsToTestPlan)(token, testPlanIssueId, [newIssueId]);
                await (0, xray_1.removeTestsFromTestPlan)(token, testPlanIssueId, [oldTest.issueId]);
            }
        }
        // Detección de Precondition duplicada: como Gherkin no permite tagear "Background:", cada
        // import de un archivo con Background crea una Precondition nueva -- incluso si el archivo
        // ya tenía Tests tageados de antes y solo se le agregó/editó un escenario. No se auto-borra
        // nada (deletePrecondition es irreversible) -- solo se avisa con los datos listos para que
        // la limpieza manual sea de copiar/pegar.
        let preconditionWarning;
        if (background) {
            const preconditionsData = await (0, xray_1.graphql)(token, `query($jql: String!) {
					getTests(jql: $jql, limit: 50) {
						results {
							jira(fields: ["key"])
							preconditions(limit: 10) { results { issueId jira(fields: ["key", "summary"]) } }
						}
					}
				}`, { jql: `key in (${usedKeys.join(",")})` });
            const preconditionsPorId = new Map();
            for (const t of preconditionsData.getTests.results) {
                for (const p of t.preconditions.results)
                    preconditionsPorId.set(p.issueId, p.jira);
            }
            if (preconditionsPorId.size > 1) {
                preconditionWarning =
                    `Se detectaron ${preconditionsPorId.size} Preconditions distintas linkeadas a estos Tests ` +
                        `(${usedKeys.join(", ")}) -- probable duplicado por re-import de un Background. Revisar y quedarse ` +
                        `con una sola (mutaciones removeTestsFromPrecondition + deletePrecondition sobre la(s) vieja(s)): ` +
                        JSON.stringify([...preconditionsPorId.entries()].map(([issueId, jira]) => ({ issueId, ...jira })));
            }
        }
        return { matches: Object.fromEntries(matches), preconditionWarning };
    }
    finally {
        fs_1.default.unlinkSync(tmpFile);
    }
}
//# sourceMappingURL=sync-scenario.js.map