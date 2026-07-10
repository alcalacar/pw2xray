"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.XRAY_API = void 0;
exports.getCloudToken = getCloudToken;
exports.graphql = graphql;
exports.sleep = sleep;
exports.listFeatureFiles = listFeatureFiles;
exports.importFeature = importFeature;
exports.importFeatures = importFeatures;
exports.addTestsToTestPlan = addTestsToTestPlan;
exports.exportFeaturesZip = exportFeaturesZip;
exports.addEvidenceToTestRun = addEvidenceToTestRun;
exports.addEvidenceToTestRunStep = addEvidenceToTestRunStep;
exports.getTestByKey = getTestByKey;
exports.removeTestsFromTestPlan = removeTestsFromTestPlan;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.XRAY_API = "https://xray.cloud.getxray.app/api/v2";
async function getCloudToken() {
    const res = await fetch(`${exports.XRAY_API}/authenticate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            client_id: process.env.XRAY_CLIENT_ID,
            client_secret: process.env.XRAY_CLIENT_SECRET,
        }),
    });
    if (!res.ok)
        throw new Error(`Xray auth falló: ${res.status} ${await res.text()}`);
    const token = (await res.json());
    return token.replace(/"/g, "");
}
async function graphql(token, query, variables) {
    const res = await fetch(`${exports.XRAY_API}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json());
    if (json.errors)
        throw new Error(`Xray GraphQL error: ${JSON.stringify(json.errors)}`);
    return json.data;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function listFeatureFiles(featuresDir) {
    return fs_1.default
        .readdirSync(featuresDir)
        .filter((f) => f.endsWith(".feature"))
        .map((f) => path_1.default.join(featuresDir, f));
}
// Sube UN .feature a Jira: crea o actualiza los Test issues tipo Cucumber, uno
// por Scenario/Scenario Outline del archivo. Es idempotente — si el escenario
// ya tiene el tag @TEST_<KEY>-xxx, actualiza ESE issue en vez de crear uno nuevo.
async function importFeature(token, projectKey, featurePath) {
    const form = new FormData();
    form.append("file", new Blob([fs_1.default.readFileSync(featurePath)], { type: "text/plain" }), path_1.default.basename(featurePath));
    const res = await fetch(`${exports.XRAY_API}/import/feature?projectKey=${projectKey}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    });
    const body = await res.text();
    if (!res.ok)
        throw new Error(`Import de ${path_1.default.basename(featurePath)} falló (${res.status}): ${body}`);
    return JSON.parse(body);
}
// Sube cada .feature "suelto" (sin carpeta) de un directorio. Correr esto cada
// vez que cambien los .feature locales para mantener sincronizada la
// definicion Gherkin que ve el equipo en Jira.
async function importFeatures(token, projectKey, featuresDir) {
    const resultados = [];
    for (const featureFile of listFeatureFiles(featuresDir)) {
        const response = await importFeature(token, projectKey, featureFile);
        resultados.push({ file: path_1.default.basename(featureFile), response });
    }
    return resultados;
}
// Asocia Tests existentes a un Test Plan (agrupa la libreria de casos por
// area en el Test Repository de Xray). Idempotente: volver a agregar un Test
// que ya esta en el Test Plan no lo duplica, Xray lo ignora sin error.
async function addTestsToTestPlan(token, testPlanIssueId, testIssueIds) {
    const mutation = `mutation($issueId: String!, $testIssueIds: [String]!) {
		addTestsToTestPlan(issueId: $issueId, testIssueIds: $testIssueIds) {
			addedTests
			warning
		}
	}`;
    return graphql(token, mutation, { issueId: testPlanIssueId, testIssueIds });
}
async function exportFeaturesZip(token, keys) {
    const res = await fetch(`${exports.XRAY_API}/export/cucumber?keys=${keys.join(",")}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/zip" },
    });
    if (!res.ok)
        throw new Error(`Export de ${keys.join(",")} falló (${res.status}): ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
}
// Adjunta evidencia al Test Run completo (no a un step puntual -- ver
// addEvidenceToTestRunStep para eso).
async function addEvidenceToTestRun(token, testRunId, evidence) {
    const mutation = `mutation($id: String!, $evidence: [AttachmentDataInput]!) {
		addEvidenceToTestRun(id: $id, evidence: $evidence) {
			addedEvidence
			warnings
		}
	}`;
    const data = await graphql(token, mutation, { id: testRunId, evidence });
    return data.addEvidenceToTestRun;
}
// Adjunta evidencia a UN step puntual (Given/When/Then) de un Test Run Cucumber,
// a diferencia de addEvidenceToTestRun que adjunta al Test Run completo. El
// stepId sale de testRuns(...).results[].steps[].id (ver getTestRunSteps).
// Mutation confirmada contra el schema real de Xray Cloud via introspection.
async function addEvidenceToTestRunStep(token, testRunId, stepId, evidence) {
    const mutation = `mutation($testRunId: String!, $stepId: String!, $evidence: [AttachmentDataInput]) {
		addEvidenceToTestRunStep(testRunId: $testRunId, stepId: $stepId, evidence: $evidence) {
			addedEvidence
			warnings
		}
	}`;
    const data = await graphql(token, mutation, { testRunId, stepId, evidence });
    return data.addEvidenceToTestRunStep;
}
// Resuelve key de Jira -> {issueId, key} via Xray. La key sola no alcanza para
// las mutaciones de Test Plan, que piden issueId.
async function getTestByKey(token, key) {
    const query = `query($jql: String!) {
		getTests(jql: $jql, limit: 1) {
			results { issueId jira(fields: ["key"]) }
		}
	}`;
    const data = await graphql(token, query, {
        jql: `key = ${key}`,
    });
    const result = data.getTests.results[0];
    return result ? { issueId: result.issueId, key: result.jira.key } : null;
}
// Inversa de addTestsToTestPlan -- saca Tests de un Test Plan (ej. un Test
// Manual viejo que se reemplaza por su equivalente Cucumber nuevo).
async function removeTestsFromTestPlan(token, testPlanIssueId, testIssueIds) {
    const mutation = `mutation($issueId: String!, $testIssueIds: [String]!) {
		removeTestsFromTestPlan(issueId: $issueId, testIssueIds: $testIssueIds)
	}`;
    const data = await graphql(token, mutation, {
        issueId: testPlanIssueId,
        testIssueIds,
    });
    return data.removeTestsFromTestPlan;
}
//# sourceMappingURL=xray.js.map