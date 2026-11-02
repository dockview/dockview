export type { MultiWindow, MultiWindowOptions } from './multiWindow';
export { installMultiWindow } from './multiWindow';
export type { MultiWindowOrchestratorOptions } from './orchestrator/multiWindowOrchestrator';
export { MultiWindowOrchestrator } from './orchestrator/multiWindowOrchestrator';
export type { MultiWindowWorkspaceState } from './orchestrator/workspaceRegistry';
export type {
    MultiWindowDragPayload,
    MultiWindowHistoryInfo,
    MultiWindowHistoryRequest,
    MultiWindowHistoryStep,
    MultiWindowMoveEvent,
    MultiWindowReleaseEvent,
    MultiWindowTransport,
} from './transport';
