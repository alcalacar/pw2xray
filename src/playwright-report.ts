import fs from "fs";

export interface PlaywrightAttachment {
	name: string;
	contentType: string;
	path?: string;
	body?: string;
}

interface PlaywrightSpec {
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

// Recorre el reporte JSON de Playwright (results/results.json) y devuelve cada
// spec con sus attachments (imagenes y adjuntos de texto/JSON via
// testInfo.attach()), para que el caller decida como agrupar (por titulo, por
// tag, etc.). El titulo de cada spec se arma como "Describe block > titulo",
// igual que el nombre que Playwright pone en el JUnit testcase -- necesario
// para que coincida con el summary que Xray ya registro al importar ese XML
// (ver upload-to-xray.ts). El primer nivel de suites (uno por archivo .spec.ts)
// se excluye del path porque ese nivel corresponde al "classname" del JUnit,
// no al nombre del test.
export function collectSpecsWithImages(jsonPath: string): { spec: PlaywrightSpec; attachments: PlaywrightAttachment[] }[] {
	if (!fs.existsSync(jsonPath)) return [];
	const data: PlaywrightJsonReport = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
	const encontrados: { spec: PlaywrightSpec; attachments: PlaywrightAttachment[] }[] = [];

	function walk(suites: PlaywrightSuite[] | undefined, titlePath: string[], esNivelDeArchivo: boolean) {
		for (const suite of suites || []) {
			const siguientePath = esNivelDeArchivo || !suite.title ? titlePath : [...titlePath, suite.title];
			for (const spec of suite.specs || []) {
				const attachments = (spec.tests || []).flatMap((t) =>
					(t.results || []).flatMap((r) => (r.attachments || []).filter(esEvidenciaValida))
				);
				if (attachments.length > 0) {
					const tituloCompleto = siguientePath.length ? `${siguientePath.join(' › ')} › ${spec.title}` : spec.title;
					encontrados.push({ spec: { ...spec, title: tituloCompleto }, attachments });
				}
			}
			walk(suite.suites, siguientePath, false);
		}
	}
	walk(data.suites, [], true);
	return encontrados;
}
