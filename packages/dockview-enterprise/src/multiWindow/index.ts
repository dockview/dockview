export type { MultiWindow, MultiWindowOptions } from './multiWindow';
export { installMultiWindow } from './multiWindow';
export type { MemoryOrchestratorOptions } from './orchestrator/memoryOrchestrator';
export { MemoryOrchestrator } from './orchestrator/memoryOrchestrator';
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
