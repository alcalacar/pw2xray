export interface SyncScenarioOptions {
    /** Path al .feature real, que se va a tagear in-place al final. */
    featurePath: string;
    projectKey: string;
    /** Nombre exacto del Scenario (sin tag) -> key de Jira a deprecar en el Test Plan, o null si no reemplaza nada. */
    scenarios: Record<string, string | null>;
    /** Si se pasa, hace swap en este Test Plan (agrega el nuevo, saca el que reemplaza). Si no, no toca ningún Test Plan. */
    testPlanIssueId?: string;
}
export interface SyncScenarioMatch {
    key: string;
    issueId: string;
}
export interface SyncScenarioResult {
    matches: Record<string, SyncScenarioMatch>;
    /** Mensaje de aviso si se detectaron Preconditions duplicadas (ver comentario abajo). No vacío = revisar a mano. */
    preconditionWarning?: string;
}
export declare function syncScenario(token: string, options: SyncScenarioOptions): Promise<SyncScenarioResult>;
//# sourceMappingURL=sync-scenario.d.ts.map