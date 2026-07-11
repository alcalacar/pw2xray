import type { Reporter, TestCase, TestResult, TestStep } from "@playwright/test/reporter";
export interface StepEvidenceReporterOptions {
    /** Path de salida. Default: results/step-evidence.json relativo al cwd. */
    outputFile?: string;
}
export default class StepEvidenceReporter implements Reporter {
    private outputFile;
    private records;
    constructor(options?: StepEvidenceReporterOptions);
    printsToStdio(): boolean;
    onStepEnd(test: TestCase, _result: TestResult, step: TestStep): void;
    onEnd(): void;
}
//# sourceMappingURL=step-evidence-reporter.d.ts.map