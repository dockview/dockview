// Base type shared by the transfer objects below. The protected constructor
// keeps it abstract in practice (only subclasses may construct it) without a
// separate marker member.
class TransferObject {
    protected constructor() {}
}

export class PanelTransfer extends TransferObject {
    constructor(
        public readonly viewId: string,
        public readonly groupId: string,
        public readonly panelId: string | null,
        public readonly tabGroupId?: string
    ) {
        super();
    }
}

export class PaneTransfer extends TransferObject {
    constructor(
        public readonly viewId: string,
        public readonly paneId: string
    ) {
        super();
    }
}

/**
 * A singleton to store transfer data during drag & drop operations that are only valid within the application.
 */
export class LocalSelectionTransfer<T> {
    private static readonly INSTANCE = new LocalSelectionTransfer();

    private data?: T[];
    private proto?: T;

    private constructor() {
        // protect against external instantiation
    }

    static getInstance<T>(): LocalSelectionTransfer<T> {
        return LocalSelectionTransfer.INSTANCE as LocalSelectionTransfer<T>;
    }

    hasData(proto: T): boolean {
        return proto && proto === this.proto;
    }

    clearData(proto: T): void {
        if (this.hasData(proto)) {
            this.proto = undefined;
            this.data = undefined;
        }
    }

    getData(proto: T): T[] | undefined {
        if (this.hasData(proto)) {
            return this.data;
        }

        return undefined;
    }

    setData(data: T[], proto: T): void {
        if (proto) {
            this.data = data;
            this.proto = proto;
        }
    }
}

export function getPanelData(): PanelTransfer | undefined {
    const panelTransfer = LocalSelectionTransfer.getInstance<PanelTransfer>();
    const isPanelEvent = panelTransfer.hasData(PanelTransfer.prototype);

    if (!isPanelEvent) {
        return undefined;
    }

    return panelTransfer.getData(PanelTransfer.prototype)![0];
}

export function getPaneData(): PaneTransfer | undefined {
    const paneTransfer = LocalSelectionTransfer.getInstance<PaneTransfer>();
    const isPanelEvent = paneTransfer.hasData(PaneTransfer.prototype);

    if (!isPanelEvent) {
        return undefined;
    }

    return paneTransfer.getData(PaneTransfer.prototype)![0];
}
