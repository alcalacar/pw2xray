import fs from "fs";
import { XrayEvidenceInput } from "./xray";

export interface PlaywrightAttachment {
	name: string;
	contentType: string;
	path?: string;
	body?: string;
}

interface PlaywrightSpec {
	id: string;
	title: string;
	tags?: string[];
	tests?: { results?: { attachments?: PlaywrightAttachment[] }[] }[];
}

interface PlaywrightSuite {
	title?: string;
	specs?: PlaywrightSpec[];
	suites?: PlaywrightSuite[];
}

interface PlaywrightJsonReport {
	suites?: PlaywrightSuite[];
}

function esEvidenciaValida(a: PlaywrightAttachment): boolean {
	const esImagen = a.contentType?.startsWith("image/");
	const esTexto = a.contentType?.startsWith("text/") || a.contentType === "application/json";
	return (esImagen || esTexto) && Boolean(a.path || a.body);
}

// Recorre el reporte JSON de Playwright (results/results.json) y arma, para
// cada spec, su titulo completo "Describe block > titulo" -- igual que el
// nombre que Playwright pone en el JUnit testcase -- necesario para que
// coincida con el summary que Xray ya registro al importar ese XML (ver
// upload-to-xray.ts) o para cruzar por id con collectStepEvidence. El primer
// nivel de suites (uno por archivo .spec.ts) se excluye del path porque ese
// nivel corresponde al "classname" del JUnit, no al nombre del test.
function walkAllSpecs(data: PlaywrightJsonReport): { spec: PlaywrightSpec; attachments: PlaywrightAttachment[] }[] {
	const encontrados: { spec: PlaywrightSpec; attachments: PlaywrightAttachment[] }[] = [];

	function walk(suites: PlaywrightSuite[] | undefined, titlePath: string[], esNivelDeArchivo: boolean) {
		for (const suite of suites || []) {
			const siguientePath = esNivelDeArchivo || !suite.title ? titlePath : [...titlePath, suite.title];
			for (const spec of suite.specs || []) {
				const attachments = (spec.tests || []).flatMap((t) =>
					(t.results || []).flatMap((r) => (r.attachments || []).filter(esEvidenciaValida))
				);
				const tituloCompleto = siguientePath.length ? `${siguientePath.join(' › ')} › ${spec.title}` : spec.title;
				encontrados.push({ spec: { ...spec, title: tituloCompleto }, attachments });
			}
			walk(suite.suites, siguientePath, false);
		}
	}
	walk(data.suites, [], true);
	return encontrados;
}

export function collectSpecsWithImages(jsonPath: string): { spec: PlaywrightSpec; attachments: PlaywrightAttachment[] }[] {
	if (!fs.existsSync(jsonPath)) return [];
	const data: PlaywrightJsonReport = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
	return walkAllSpecs(data).filter(({ attachments }) => attachments.length > 0);
}

// Convierte adjuntos de Playwright (path en disco o body ya en memoria) al
// shape que espera la mutation addEvidenceToTestRun(Step) de Xray.
export function toXrayEvidence(attachments: PlaywrightAttachment[]): XrayEvidenceInput[] {
	return attachments.map((a) => {
		const ext = a.contentType.split("/")[1] || "png";
		return {
			data: a.body ? a.body : fs.readFileSync(a.path!).toString("base64"),
			filename: `${a.name}.${ext}`,
			mimeType: a.contentType,
		};
	});
}

// Registro que escribe StepEvidenceReporter por cada step de Gherkin con
// adjuntos -- existe porque el reporter JSON incorporado de Playwright NO
// serializa la asociacion adjunto<->step (JSONReportTestStep no tiene
// "attachments", a diferencia del TestStep de la API en vivo de Reporter).
export interface StepEvidenceRecord {
	testId: string;
	testTags: string[];
	stepTitle: string;
	attachments: PlaywrightAttachment[];
}

export interface SpecStepEvidence {
	spec: PlaywrightSpec;
	steps: { stepTitle: string; attachments: PlaywrightAttachment[] }[];
}

// Cruza el archivo de evidencia por step (generado por StepEvidenceReporter)
// contra results/results.json, usando el id de spec que Playwright ya calcula
// internamente como clave -- no hace falta reconstruir el titulo del test con
// logica separada, se reusa el mismo camino que collectSpecsWithImages.
export function collectStepEvidence(jsonPath: string, stepEvidencePath: string): SpecStepEvidence[] {
	if (!fs.existsSync(stepEvidencePath) || !fs.existsSync(jsonPath)) return [];
	const records: StepEvidenceRecord[] = JSON.parse(fs.readFileSync(stepEvidencePath, "utf8"));
	if (records.length === 0) return [];

	const data: PlaywrightJsonReport = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
	const specsById = new Map(walkAllSpecs(data).map(({ spec }) => [spec.id, spec]));

	const bySpecId = new Map<string, SpecStepEvidence>();
	for (const record of records) {
		const spec = specsById.get(record.testId);
		if (!spec) continue; // step de un test que no aparece en esta corrida (ej. retry descartado)
		if (!bySpecId.has(record.testId)) bySpecId.set(record.testId, { spec, steps: [] });
		bySpecId.get(record.testId)!.steps.push({ stepTitle: record.stepTitle, attachments: record.attachments });
	}
	return [...bySpecId.values()];
}
