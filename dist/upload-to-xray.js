"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToXray = uploadToXray;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const xray_1 = require("./xray");
const playwright_report_1 = require("./playwright-report");
function buildInfo(jiraProjectKey) {
    return {
        fields: {
            project: { key: jiraProjectKey },
            summary: `Playwright execution - ${new Date().toISOString()}`,
            description: "Import automático desde resultados JUnit de Playwright.",
            issuetype: { name: "Test Execution" },
        },
    };
}
function buildForm(jiraProjectKey, xmlBuffer) {
    const form = new FormData();
    form.append("info", new Blob([JSON.stringify(buildInfo(jiraProjectKey))], { type: "application/json" }), "info.json");
    form.append("results", new Blob([xmlBuffer], { type: "text/xml" }), "junit-report.xml");
    return form;
}
async function uploadCloud(token, jiraProjectKey, xmlBuffer) {
    return fetch(`${xray_1.XRAY_API}/import/execution/junit/multipart`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: buildForm(jiraProjectKey, xmlBuffer),
    });
}
async function uploadOnPremise(jiraProjectKey, xmlBuffer) {
    const baseUrl = process.env.JIRA_BASE_URL;
    return fetch(`${baseUrl}/rest/raven/2.0/import/execution/junit/multipart`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.JIRA_PAT}` },
        body: buildForm(jiraProjectKey, xmlBuffer),
    });
}
// --- Evidencia (screenshots) ---
// Se junta TODA imagen/adjunto por test (el screenshot final automático de
// `screenshot: 'on'`, más cualquier captura o JSON agregado a mano con
// `testInfo.attach()`), agrupada por título de test.
function collectScreenshotsByTitle(jsonPath) {
    return (0, playwright_report_1.collectSpecsWithImages)(jsonPath).map(({ spec, attachments }) => ({ title: spec.title, attachments }));
}
// Justo despues del import, los Test Runs recien creados a veces todavia no
// son consultables via GraphQL (consistencia eventual de Xray Cloud) —
// reintenta con espera antes de asumir que no existen.
async function getTestRunsForExecution(token, testExecKey, intentos = 4) {
    const query = `query($jql: String!) {
		getTestExecutions(jql: $jql, limit: 1) {
			results {
				testRuns(limit: 100) {
					results {
						id
						test { jira(fields: ["summary"]) }
					}
				}
			}
		}
	}`;
    for (let i = 1; i <= intentos; i++) {
        const data = await (0, xray_1.graphql)(token, query, { jql: `key=${testExecKey}` });
        const testRuns = data.getTestExecutions.results[0]?.testRuns.results || [];
        if (testRuns.length > 0)
            return testRuns;
        console.log(`  esperando a que Xray indexe los Test Runs... (${i}/${intentos})`);
        await (0, xray_1.sleep)(3000);
    }
    return [];
}
async function subirEvidencia(token, testExecKey, resultsJsonPath) {
    const screenshotsByTitle = collectScreenshotsByTitle(resultsJsonPath);
    if (screenshotsByTitle.length === 0) {
        console.log("Sin capturas para adjuntar.");
        return;
    }
    const testRuns = await getTestRunsForExecution(token, testExecKey);
    for (const { title, attachments } of screenshotsByTitle) {
        const testRun = testRuns.find((tr) => tr.test?.jira?.summary === title);
        if (!testRun) {
            console.warn(`  aviso: no se encontro Test Run para "${title}", no se adjunto evidencia`);
            continue;
        }
        const result = await (0, xray_1.addEvidenceToTestRun)(token, testRun.id, (0, playwright_report_1.toXrayEvidence)(attachments));
        console.log(`  evidencia adjuntada (${attachments.length}): "${title}" -> testRun ${testRun.id}`);
        if (result.warnings?.length) {
            console.warn(`    warnings: ${result.warnings.join(", ")}`);
        }
    }
}
// Importa un reporte JUnit de Playwright a Xray (crea una Test Execution nueva
// cada vez — Xray no actualiza una existente via este endpoint) y adjunta como
// evidencia las capturas/JSON de cada test. Requiere XRAY_CLIENT_ID/SECRET y
// JIRA_PROJECT_KEY en el .env del repo consumidor (o JIRA_BASE_URL/JIRA_PAT y
// XRAY_MODE=on-premise para Xray Server/DC).
async function uploadToXray(options = {}) {
    const XRAY_MODE = process.env.XRAY_MODE || "cloud";
    const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY;
    const resultsPath = options.resultsPath || path_1.default.resolve(process.cwd(), "results", "junit-report.xml");
    const resultsJsonPath = options.resultsJsonPath || path_1.default.resolve(process.cwd(), "results", "results.json");
    if (!fs_1.default.existsSync(resultsPath)) {
        console.error(`No se encontró el reporte JUnit en ${resultsPath}. Corré "npm test" primero.`);
        process.exitCode = 1;
        return;
    }
    if (!JIRA_PROJECT_KEY) {
        console.error("Falta JIRA_PROJECT_KEY en .env");
        process.exitCode = 1;
        return;
    }
    const xmlBuffer = fs_1.default.readFileSync(resultsPath);
    const token = XRAY_MODE === "on-premise" ? "" : await (0, xray_1.getCloudToken)();
    const res = XRAY_MODE === "on-premise" ? await uploadOnPremise(JIRA_PROJECT_KEY, xmlBuffer) : await uploadCloud(token, JIRA_PROJECT_KEY, xmlBuffer);
    const body = await res.text();
    if (!res.ok) {
        console.error(`Xray respondió ${res.status}:\n${body}`);
        process.exitCode = 1;
        return;
    }
    console.log("Import exitoso:", body);
    if (XRAY_MODE === "on-premise") {
        console.log("Nota: adjuntar evidencia automáticamente solo está implementado para XRAY_MODE=cloud por ahora.");
        return;
    }
    const testExecKey = JSON.parse(body).key;
    if (!testExecKey) {
        console.warn("No se pudo determinar el key de la Test Execution creada; no se adjunta evidencia.");
        return;
    }
    await subirEvidencia(token, testExecKey, resultsJsonPath);
}
//# sourceMappingURL=upload-to-xray.js.map