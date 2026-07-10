export declare const XRAY_API = "https://xray.cloud.getxray.app/api/v2";
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
export declare function getCloudToken(): Promise<string>;
export declare function graphql<T = unknown>(token: string, query: string, variables?: Record<string, unknown>): Promise<T>;
export declare function sleep(ms: number): Promise<void>;
export declare function listFeatureFiles(featuresDir: string): string[];
export declare function importFeature(token: string, projectKey: string, featurePath: string): Promise<ImportFeatureResponse>;
export declare function importFeatures(token: string, projectKey: string, featuresDir: string): Promise<ImportFeatureResult[]>;
export interface AddTestsToTestPlanResponse {
    addTestsToTestPlan: {
        addedTests: string[];
        warning?: string | null;
    };
}
export declare function addTestsToTestPlan(token: string, testPlanIssueId: string, testIssueIds: string[]): Promise<AddTestsToTestPlanResponse>;
export declare function exportFeaturesZip(token: string, keys: string[]): Promise<Buffer>;
export interface AddEvidenceResult {
    addedEvidence: string[];
    warnings: string[];
}
export interface XrayEvidenceInput {
    data: string;
    filename: string;
    mimeType: string;
}
export declare function addEvidenceToTestRun(token: string, testRunId: string, evidence: XrayEvidenceInput[]): Promise<AddEvidenceResult>;
export declare function addEvidenceToTestRunStep(token: string, testRunId: string, stepId: string, evidence: XrayEvidenceInput[]): Promise<AddEvidenceResult>;
export interface XrayTestRef {
    issueId: string;
    key: string;
}
export declare function getTestByKey(token: string, key: string): Promise<XrayTestRef | null>;
export interface RemoveTestsFromTestPlanResponse {
    removeTestsFromTestPlan: string | null;
}
export declare function removeTestsFromTestPlan(token: string, testPlanIssueId: string, testIssueIds: string[]): Promise<string | null>;
//# sourceMappingURL=xray.d.ts.map