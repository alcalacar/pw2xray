import fs from "fs";
import path from "path";
import type { Reporter, TestCase, TestResult, TestStep } from "@playwright/test/reporter";
import type { StepEvidenceRecord } from "./playwright-report";

export interface StepEvidenceReporterOptions {
	/** Path de salida. Default: results/step-evidence.json relativo al cwd. */
	outputFile?: string;
}

// Reporter custom que corre en paralelo a los reporters json/junit ya
// configurados (no los reemplaza). Existe porque el reporter JSON incorporado
// de Playwright NO serializa la asociacion adjunto<->step: JSONReportTestStep
// (lo que queda en results/results.json) no tiene campo "attachments", a
// diferencia del TestStep que expone la API en vivo de Reporter -- sin este
// reporter esa asociacion se pierde apenas termina la corrida.
//
// Uso en playwright.config.ts:
//   reporter: [
//     ['html'], ['junit', {...}], ['json', {...}],
//     ['pw2xray/step-evidence-reporter', { outputFile: 'results/step-evidence.json' }],
//   ]
export default class StepEvidenceReporter implements Reporter {
	private outputFile: string;
	private records: StepEvidenceRecord[] = [];

	constructor(options: StepEvidenceReporterOptions = {}) {
		this.outputFile = options.outputFile || path.resolve(process.cwd(), "results", "step-evidence.json");
	}

	// Sin esto, Playwright asume por defecto que este reporter SI imprime a
	// terminal (runner/index.js: `r.printsToStdio ? r.printsToStdio() : true`),
	// lo que apaga el reporter "line"/"dot" que Playwright agrega automaticamente
	// cuando ningun reporter configurado reclama la terminal -- confirmado en
	// vivo: con este reporter activo (junto a html/junit/json, que si declaran
	// printsToStdio()=false por tener outputFile) la corrida funcionaba bien
	// (junit/json/step-evidence.json se generaban) pero sin NINGUN output de
	// progreso ni resumen final en terminal.
	printsToStdio(): boolean {
		return false;
	}

	onStepEnd(test: TestCase, _result: TestResult, step: TestStep): void {
		if (!step.attachments || step.attachments.length === 0) return;
		// step.title en el step que realmente trae adjuntos es el de la anotacion interna que
		// genera testInfo.attach() (categoria "test.attach", titulo tipo 'Attach "nombre"'), NO
		// el step de Gherkin/test.step() que lo contiene -- confirmado empiricamente. El primer
		// nivel de titlePath() es siempre el step exterior real (Given/When/Then en BDD), asi
		// que es lo que hay que usar para matchear despues contra los steps de Xray.
		const stepTitle = step.titlePath()[0] ?? step.title;
		this.records.push({
			testId: test.id,
			testTags: test.tags,
			stepTitle,
			attachments: step.attachments.map((a) => ({
				name: a.name,
				contentType: a.contentType,
				path: a.path,
				body: a.body ? a.body.toString("base64") : undefined,
			})),
		});
	}

	onEnd(): void {
		fs.mkdirSync(path.dirname(this.outputFile), { recursive: true });
		fs.writeFileSync(this.outputFile, JSON.stringify(this.records, null, 2), "utf8");
	}
}
