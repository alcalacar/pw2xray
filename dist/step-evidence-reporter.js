"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
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
class StepEvidenceReporter {
    outputFile;
    records = [];
    constructor(options = {}) {
        this.outputFile = options.outputFile || path_1.default.resolve(process.cwd(), "results", "step-evidence.json");
    }
    onStepEnd(test, _result, step) {
        if (!step.attachments || step.attachments.length === 0)
            return;
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
    onEnd() {
        fs_1.default.mkdirSync(path_1.default.dirname(this.outputFile), { recursive: true });
        fs_1.default.writeFileSync(this.outputFile, JSON.stringify(this.records, null, 2), "utf8");
    }
}
exports.default = StepEvidenceReporter;
//# sourceMappingURL=step-evidence-reporter.js.map