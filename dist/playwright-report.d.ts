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
    tests?: {
        results?: {
            attachments?: PlaywrightAttachment[];
        }[];
    }[];
}
export declare function collectSpecsWithImages(jsonPath: string): {
    spec: PlaywrightSpec;
    attachments: PlaywrightAttachment[];
}[];
export declare function toXrayEvidence(attachments: PlaywrightAttachment[]): XrayEvidenceInput[];
export interface StepEvidenceRecord {
    testId: string;
    testTags: string[];
    stepTitle: string;
    attachments: PlaywrightAttachment[];
}
export interface SpecStepEvidence {
    spec: PlaywrightSpec;
    steps: {
        stepTitle: string;
        attachments: PlaywrightAttachment[];
    }[];
}
export declare function collectStepEvidence(jsonPath: string, stepEvidencePath: string): SpecStepEvidence[];
export {};
//# sourceMappingURL=playwright-report.d.ts.map