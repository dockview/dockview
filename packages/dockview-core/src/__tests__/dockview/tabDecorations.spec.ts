import { DockviewComponent } from '../../dockview/dockviewComponent';
import { AllModules } from '../../dockview/allModules';
import { DockviewModule, ITabDecoration } from '../../dockview/modules';
import { IDockviewPanel } from '../../dockview/dockviewPanel';
import {
    GroupPanelPartInitParameters,
    IContentRenderer,
    ITabRenderer,
} from '../../dockview/types';
import { Emitter } from '../../events';

/**
 * Tab decorations let a module contribute an element into every tab, rather
 * than core hardcoding the markup on its behalf (as it still does for the pin
 * glyph). The cases that matter are the ones a naive implementation gets
 * wrong: updating in place, not stealing tab activation, and staying out of a
 * custom tab renderer's markup unless asked.
 */

class Part implements IContentRenderer, ITabRenderer {
    element: HTMLElement = document.createElement('div');
    constructor(public readonly id: string) {}
    init(_p: GroupPanelPartInitParameters): void {}
    layout(): void {}
    update(): void {}
    dispose(): void {}
}

class TestDecoration implements ITabDecoration {
    readonly renders: string[] = [];
    private readonly _onDidChangeTabDecoration = new Emitter<{
        panelId?: string;
    }>();
    readonly onDidChangeTabDecoration = this._onDidChangeTabDecoration.event;

    label = 'x';
    hiddenFor = new Set<string>();

    constructor(
        readonly decorationKey: string,
        readonly options: {
            placement?: 'before' | 'after';
            order?: number;
            interactive?: boolean;
            renderWithCustomTab?: boolean;
        } = {}
    ) {}

    get placement() {
        return this.options.placement;
    }
    get order() {
        return this.options.order;
    }
    get interactive() {
        return this.options.interactive;
    }
    get renderWithCustomTab() {
        return this.options.renderWithCustomTab;
    }

    fire(panelId?: string): void {
        this._onDidChangeTabDecoration.fire({ panelId });
    }

    renderTabDecoration(
        panel: IDockviewPanel,
        element: HTMLElement | undefined
    ): HTMLElement | null {
        this.renders.push(panel.id);

        if (this.hiddenFor.has(panel.id)) {
            return null;
        }

        const el = element ?? document.createElement('span');
        el.className = `deco-${this.decorationKey}`;
        el.textContent = this.label;
        return el;
    }
}

function moduleFor(
    decoration: ITabDecoration,
    key = 'testDecorationService'
): DockviewModule<unknown> {
    return {
        moduleName: `TestDecoration:${key}`,
        services: { [key]: () => decoration },
    };
}

function createComponent(modules: DockviewModule<unknown>[] = []) {
    const dv = new DockviewComponent(document.createElement('div'), {
        createComponent: (o) => new Part(o.id),
        createTabComponent: (o) => new Part(o.id),
        modules: [...AllModules, ...modules],
    } as never);
    dv.layout(800, 600);
    return dv;
}

function tabFor(dv: DockviewComponent, panelId: string): HTMLElement {
    const el = dv.element.querySelector<HTMLElement>(
        `.dv-tab[data-tab-panel-id="${panelId}"]`
    );
    if (!el) {
        throw new Error(`no tab for ${panelId}`);
    }
    return el;
}

describe('tab decorations', () => {
    test('renders into the leading container by default', () => {
        const deco = new TestDecoration('chan');
        const dv = createComponent([moduleFor(deco)]);
        dv.addPanel({ id: 'p1', component: 'default' });

        const container = tabFor(dv, 'p1').querySelector(
            '.dv-tab-decorations--before'
        );
        expect(container?.querySelector('.deco-chan')).not.toBeNull();
    });

    test('sits after the tab content when placement is after', () => {
        const deco = new TestDecoration('chan', { placement: 'after' });
        const dv = createComponent([moduleFor(deco)]);
        dv.addPanel({ id: 'p1', component: 'default' });

        const tab = tabFor(dv, 'p1');
        const container = tab.querySelector('.dv-tab-decorations--after');
        expect(container).not.toBeNull();
        expect(tab.lastChild).toBe(container);
    });

    test('orders by `order` then key, not registration sequence', () => {
        const late = new TestDecoration('aaa', { order: 10 });
        const early = new TestDecoration('zzz', { order: 1 });
        const dv = createComponent([
            moduleFor(late, 'svcA'),
            moduleFor(early, 'svcB'),
        ]);
        dv.addPanel({ id: 'p1', component: 'default' });

        const rendered = Array.from(
            tabFor(dv, 'p1').querySelectorAll('.dv-tab-decorations--before > *')
        ).map((el) => el.className);

        expect(rendered).toEqual(['deco-zzz', 'deco-aaa']);
    });

    test('updates in place rather than rebuilding', () => {
        const deco = new TestDecoration('chan');
        const dv = createComponent([moduleFor(deco)]);
        dv.addPanel({ id: 'p1', component: 'default' });

        const first = tabFor(dv, 'p1').querySelector('.deco-chan');
        deco.label = 'y';
        deco.fire('p1');

        const second = tabFor(dv, 'p1').querySelector('.deco-chan');
        expect(second).toBe(first);
        expect(second?.textContent).toBe('y');
    });

    test('returning null removes a previously rendered decoration', () => {
        const deco = new TestDecoration('chan');
        const dv = createComponent([moduleFor(deco)]);
        dv.addPanel({ id: 'p1', component: 'default' });
        expect(tabFor(dv, 'p1').querySelector('.deco-chan')).not.toBeNull();

        deco.hiddenFor.add('p1');
        deco.fire('p1');

        expect(tabFor(dv, 'p1').querySelector('.deco-chan')).toBeNull();
    });

    test('a narrowed change event only re-renders the named tab', () => {
        const deco = new TestDecoration('chan');
        const dv = createComponent([moduleFor(deco)]);
        dv.addPanel({ id: 'p1', component: 'default' });
        dv.addPanel({ id: 'p2', component: 'default' });

        deco.renders.length = 0;
        deco.fire('p2');

        expect(deco.renders).toEqual(['p2']);
    });

    test('stays out of a custom tab renderer unless it opts in', () => {
        const shy = new TestDecoration('shy');
        const bold = new TestDecoration('bold', { renderWithCustomTab: true });
        const dv = createComponent([
            moduleFor(shy, 'svcA'),
            moduleFor(bold, 'svcB'),
        ]);
        dv.addPanel({
            id: 'p1',
            component: 'default',
            tabComponent: 'custom',
        });

        const tab = tabFor(dv, 'p1');
        expect(tab.querySelector('.deco-shy')).toBeNull();
        expect(tab.querySelector('.deco-bold')).not.toBeNull();
    });

    test('an interactive decoration keeps its events off the tab', () => {
        // The tab activates on `pointerdown` / `click` and begins a drag from
        // the same element, so an interactive decoration must stop them.
        const deco = new TestDecoration('chan', { interactive: true });
        const dv = createComponent([moduleFor(deco)]);
        dv.addPanel({ id: 'p1', component: 'default' });

        const tab = tabFor(dv, 'p1');
        const reachedTab = jest.fn();
        tab.addEventListener('pointerdown', reachedTab);
        tab.addEventListener('click', reachedTab);
        tab.addEventListener('dragstart', reachedTab);

        const decoration = tab.querySelector('.deco-chan')!;
        decoration.dispatchEvent(
            new MouseEvent('pointerdown', { bubbles: true })
        );
        decoration.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        decoration.dispatchEvent(new Event('dragstart', { bubbles: true }));

        expect(reachedTab).not.toHaveBeenCalled();
        expect((decoration as HTMLElement).draggable).toBe(false);
    });

    test('a passive decoration stays click-through', () => {
        const deco = new TestDecoration('chan');
        const dv = createComponent([moduleFor(deco)]);
        dv.addPanel({ id: 'p1', component: 'default' });

        const tab = tabFor(dv, 'p1');
        const reachedTab = jest.fn();
        tab.addEventListener('click', reachedTab);

        tab.querySelector('.deco-chan')!.dispatchEvent(
            new MouseEvent('click', { bubbles: true })
        );

        expect(reachedTab).toHaveBeenCalled();
    });

    test('two decorations claiming one key is an error', () => {
        const dv = createComponent([
            moduleFor(new TestDecoration('chan'), 'svcA'),
            moduleFor(new TestDecoration('chan'), 'svcB'),
        ]);

        expect(() => dv.tabDecorations).toThrow(
            /duplicate tab decoration key 'chan'/
        );
    });
});
