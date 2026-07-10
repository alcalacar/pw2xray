import fs from "fs";
import path from "path";

export const XRAY_API = "https://xray.cloud.getxray.app/api/v2";

export interface XrayIssueRef {
	id: string;
	key: string;
	self: string;
}

export interface ImportFeatureResponse {
	errors: string[];
	updatedOrCreatedTests: XrayIssueRef[];
	updatedOrCreatedPreconditions: XrayIssueRef[];
}

export interface ImportFeatureResult {
	file: string;
	response: ImportFeatureResponse;
}

export async function getCloudToken(): Promise<string> {
	const res = await fetch(`${XRAY_API}/authenticate`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			client_id: process.env.XRAY_CLIENT_ID,
			client_secret: process.env.XRAY_CLIENT_SECRET,
		}),
	});
	if (!res.ok) throw new Error(`Xray auth falló: ${res.status} ${await res.text()}`);
	const token = (await res.json()) as string;
	return token.replace(/"/g, "");
}

export async function graphql<T = unknown>(
	token: string,
	query: string,
	variables?: Record<string, unknown>
): Promise<T> {
	const res = await fetch(`${XRAY_API}/graphql`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
		body: JSON.stringify({ query, variables }),
	});
	const json = (await res.json()) as { errors?: unknown; data?: T };
	if (json.errors) throw new Error(`Xray GraphQL error: ${JSON.stringify(json.errors)}`);
	return json.data as T;
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function listFeatureFiles(featuresDir: string): string[] {
	return fs
		.readdirSync(featuresDir)
		.filter((f) => f.endsWith(".feature"))
		.map((f) => path.join(featuresDir, f));
}

// Sube cada .feature "suelto" (sin carpeta) a Jira: crea o actualiza los Test
// issues tipo Cucumber, uno por Scenario/Scenario Outline. Es idempotente —
// si el escenario ya tiene el tag @TEST_AQ-xxx, actualiza ESE issue en vez de
// crear uno nuevo. Correr esto cada vez que cambien los .feature locales para
// mantener sincronizada la definicion Gherkin que ve el equipo en Jira.
export async function importFeatures(
	token: string,
	projectKey: string,
	featuresDir: string
): Promise<ImportFeatureResult[]> {
	const resultados: ImportFeatureResult[] = [];
	for (const featureFile of listFeatureFiles(featuresDir)) {
		const form = new FormData();
		form.append(
			"file",
			new Blob([fs.readFileSync(featureFile) as any], { type: "text/plain" }),
			path.basename(featureFile)
		);
		const res = await fetch(`${XRAY_API}/import/feature?projectKey=${projectKey}`, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
			body: form,
		});
		const body = await res.text();
		if (!res.ok) throw new Error(`Import de ${path.basename(featureFile)} falló (${res.status}): ${body}`);
		resultados.push({ file: path.basename(featureFile), response: JSON.parse(body) });
	}
	return resultados;
}

// Descarga de Jira los .feature tal como Xray los exporta para los Test keys
// dados (con el tag @TEST_AQ-xxx que Xray mismo inyecta). Sirve para verificar
// que lo que quedo en Jira coincide con lo que hay en el repo.
export interface AddTestsToTestPlanResponse {
	addTestsToTestPlan: { addedTests: string[]; warning?: string | null };
}

// Asocia Tests existentes a un Test Plan (agrupa la libreria de casos por
// area en el Test Repository de Xray). Idempotente: volver a agregar un Test
// que ya esta en el Test Plan no lo duplica, Xray lo ignora sin error.
export async function addTestsToTestPlan(
	token: string,
	testPlanIssueId: string,
	testIssueIds: string[]
): Promise<AddTestsToTestPlanResponse> {
	const mutation = `mutation($issueId: String!, $testIssueIds: [String]!) {
		addTestsToTestPlan(issueId: $issueId, testIssueIds: $testIssueIds) {
			addedTests
			warning
		}
	}`;
	return graphql<AddTestsToTestPlanResponse>(token, mutation, { issueId: testPlanIssueId, testIssueIds });
}

export async function exportFeaturesZip(token: string, keys: string[]): Promise<Buffer> {
	const res = await fetch(`${XRAY_API}/export/cucumber?keys=${keys.join(",")}`, {
		method: "GET",
		headers: { Authorization: `Bearer ${token}`, Accept: "application/zip" },
	});
	if (!res.ok) throw new Error(`Export de ${keys.join(",")} falló (${res.status}): ${await res.text()}`);
	return Buffer.from(await res.arrayBuffer());
}
