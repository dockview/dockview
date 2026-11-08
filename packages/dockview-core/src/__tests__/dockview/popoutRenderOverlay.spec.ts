import { DockviewComponent } from '../../dockview/dockviewComponent';
import type { DockviewGroupPanel } from '../../dockview/dockviewGroupPanel';
import type { IContentRenderer } from '../../dockview/types';
import type { OverlayRenderContainer } from '../../overlay/overlayRenderContainer';
import { setupMockWindow } from '../__mocks__/mockWindow';

/**
 * A panel rendered with `renderer: 'always'` owns an overlay in the render
 * container of the window it lives in. When a single panel crosses windows
 * (main <-> popout, popout <-> popout) without its whole group, the source
 * container must drop its overlay; a leftover one is empty but keeps its
 * size and position, sitting over the source group and swallowing clicks.
 *
 * https://github.com/dockview/dockview/issues/1759
 */

class TestPanel implements IContentRenderer {
  element = document.createElement('div');
  init(): void {}
  layout(): void {}
  dispose(): void {}
}

function overlayIds(container: OverlayRenderContainer): string[] {
  return Array.from(
    container.element.querySelectorAll<HTMLElement>('.dv-render-overlay'),
  )
    .map(
      (el) =>
        el.querySelector('[data-testid]')?.getAttribute('data-testid') ?? '?',
    )
    .sort();
}

describe('single-panel moves across windows with renderer "always"', () => {
  const originalOpen = window.open;
  let container: HTMLElement;
  let dockview: DockviewComponent;

  beforeEach(() => {
    window.open = () => setupMockWindow();
    container = document.createElement('div');
    document.body.appendChild(container);
    dockview = new DockviewComponent(container, {
      createComponent: (options) => {
        const panel = new TestPanel();
        panel.element.setAttribute('data-testid', options.id);
        return panel;
      },
      defaultRenderer: 'always',
    });
    dockview.layout(800, 400);
  });

  afterEach(() => {
    dockview.dispose();
    container.remove();
    window.open = originalOpen;
  });

  const popoutContainer = (group: DockviewGroupPanel) =>
    group.model.renderContainer;

  test('popping out one panel of a multi-panel group leaves no overlay behind', async () => {
    dockview.addPanel({ id: 'a', component: 'default' });
    const b = dockview.addPanel({ id: 'b', component: 'default' });

    expect(overlayIds(dockview.overlayRenderContainer)).toEqual(['a', 'b']);

    await dockview.addPopoutGroup(b);

    expect(b.group.api.location.type).toBe('popout');
    expect(overlayIds(dockview.overlayRenderContainer)).toEqual(['a']);
    expect(overlayIds(popoutContainer(b.group))).toEqual(['b']);
  });

  test('moving one panel out of a multi-panel popout group into a main group leaves no overlay behind', async () => {
    const a = dockview.addPanel({ id: 'a', component: 'default' });
    const b = dockview.addPanel({
      id: 'b',
      component: 'default',
      position: { direction: 'right' },
    });
    const c = dockview.addPanel({
      id: 'c',
      component: 'default',
      position: { referencePanel: b },
    });

    await dockview.addPopoutGroup(b.group);
    const popoutGroup = b.group;
    const popoutRender = popoutContainer(popoutGroup);
    expect(overlayIds(popoutRender)).toEqual(['b', 'c']);

    c.api.moveTo({ group: a.group, position: 'center' });

    expect(c.group).toBe(a.group);
    expect(overlayIds(popoutRender)).toEqual(['b']);
    expect(overlayIds(dockview.overlayRenderContainer)).toEqual(['a', 'c']);
  });

  test('moving one panel out of a multi-panel popout group to the edge of a main group leaves no overlay behind', async () => {
    const a = dockview.addPanel({ id: 'a', component: 'default' });
    const b = dockview.addPanel({
      id: 'b',
      component: 'default',
      position: { direction: 'right' },
    });
    const c = dockview.addPanel({
      id: 'c',
      component: 'default',
      position: { referencePanel: b },
    });

    await dockview.addPopoutGroup(b.group);
    const popoutRender = popoutContainer(b.group);

    c.api.moveTo({ group: a.group, position: 'right' });

    expect(c.group.api.location.type).toBe('grid');
    expect(overlayIds(popoutRender)).toEqual(['b']);
    expect(overlayIds(dockview.overlayRenderContainer)).toEqual(['a', 'c']);
  });

  test('moving one panel from a main group into a popout group leaves no overlay behind', async () => {
    dockview.addPanel({ id: 'a', component: 'default' });
    const b = dockview.addPanel({ id: 'b', component: 'default' });
    const c = dockview.addPanel({
      id: 'c',
      component: 'default',
      position: { direction: 'right' },
    });

    await dockview.addPopoutGroup(c.group);
    const popoutRender = popoutContainer(c.group);

    b.api.moveTo({ group: c.group, position: 'center' });

    expect(b.group).toBe(c.group);
    expect(overlayIds(dockview.overlayRenderContainer)).toEqual(['a']);
    expect(overlayIds(popoutRender)).toEqual(['b', 'c']);
  });
});
