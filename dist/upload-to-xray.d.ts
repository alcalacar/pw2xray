export interface UploadToXrayOptions {
    /** Path al XML JUnit a importar. Default: results/junit-report.xml relativo al cwd. */
    resultsPath?: string;
    /** Path al results.json (para adjuntar evidencia). Default: results/results.json relativo al cwd. */
    resultsJsonPath?: string;
}
export declare function uploadToXray(options?: UploadToXrayOptions): Promise<void>;
//# sourceMappingURL=upload-to-xray.d.ts.map