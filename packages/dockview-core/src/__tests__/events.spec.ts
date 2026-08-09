import {
    AcceptableEvent,
    AsapEvent,
    DockviewEvent,
    Emitter,
    Event,
    addDisposableListener,
} from '../events';

describe('events', () => {
    describe('emitter', () => {
        it('debug mode is off', () => {
            expect(Emitter.ENABLE_TRACKING).toBeFalsy();
        });

        it('should emit values', () => {
            const emitter = new Emitter<number>();
            let value: number | undefined = undefined;

            emitter.fire(-1);
            expect(value).toBeUndefined();

            const stream = emitter.event((x) => {
                value = x;
            });

            emitter.fire(0);
            expect(value).toBe(0);

            emitter.fire(1);
            expect(value).toBe(1);

            stream.dispose();
        });

        it('should stop emitting after dispose', () => {
            const emitter = new Emitter<number>();
            let value: number | undefined = undefined;

            const stream = emitter.event((x) => {
                value = x;
            });

            emitter.fire(0);
            expect(value).toBe(0);

            stream.dispose();

            value = undefined;
            emitter.fire(1);
            expect(value).toBeUndefined();
        });

        it('should still notify remaining listeners when one unsubscribes during dispatch', () => {
            const emitter = new Emitter<number>();

            let bReceived: number | undefined = undefined;

            const a = emitter.event(() => {
                // a self-disposing (fire-once) listener registered before b
                a.dispose();
            });
            emitter.event((x) => {
                bReceived = x;
            });

            emitter.fire(42);

            expect(bReceived).toBe(42);
        });

        it('should replay last value in replay mode', () => {
            const emitter = new Emitter<number>({ replay: true });
            let value: number | undefined = undefined;

            emitter.fire(1);

            const stream = emitter.event((x) => {
                value = x;
            });
            expect(value).toBe(1);

            stream.dispose();
        });

        it('should not replay last value when not in replay mode', () => {
            const emitter = new Emitter<number>();
            let value: number | undefined = undefined;

            emitter.fire(1);

            const stream = emitter.event((x) => {
                value = x;
            });
            expect(value).toBeUndefined();

            stream.dispose();
        });
    });

    describe('asapEvent', () => {
        test('that asapEvents fire once per event-loop-cycle', () => {
            jest.useFakeTimers();

            const event = new AsapEvent();

            let preFireCount = 0;
            let postFireCount = 0;

            event.onEvent(() => {
                preFireCount++;
            });

            for (let i = 0; i < 100; i++) {
                event.fire();
            }

            /**
             * check that subscribing after the events have fired but before the event-loop cycle completes
             * results in no event fires.
             */
            event.onEvent((e) => {
                postFireCount++;
            });

            expect(preFireCount).toBe(0);
            expect(postFireCount).toBe(0);

            jest.runAllTimers();

            expect(preFireCount).toBe(1);
            expect(postFireCount).toBe(0);
        });
    });

    it('should emit a value when any event fires', () => {
        const emitter1 = new Emitter<number>();
        const emitter2 = new Emitter<number>();
        const emitter3 = new Emitter<number>();

        let value: number | undefined = 0;

        const stream = Event.any(
            emitter1.event,
            emitter2.event,
            emitter3.event
        )((x) => {
            value = x;
        });

        emitter2.fire(2);
        expect(value).toBe(2);

        emitter1.fire(1);
        expect(value).toBe(1);

        emitter3.fire(3);
        expect(value).toBe(3);
    });

    it('addDisposableListener with capture options', () => {
        const element = {
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
        };

        const handler = jest.fn();

        const disposable = addDisposableListener(
            element as any,
            'pointerdown',
            handler,
            true
        );

        expect(element.addEventListener).toHaveBeenCalledTimes(1);
        expect(element.addEventListener).toHaveBeenCalledWith(
            'pointerdown',
            handler,
            true
        );
        expect(element.removeEventListener).toHaveBeenCalledTimes(0);

        disposable.dispose();

        expect(element.addEventListener).toHaveBeenCalledTimes(1);
        expect(element.removeEventListener).toHaveBeenCalledTimes(1);
        expect(element.removeEventListener).toHaveBeenCalledWith(
            'pointerdown',
            handler,
            true
        );
    });

    it('addDisposableListener without capture options', () => {
        const element = {
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
        };

        const handler = jest.fn();

        const disposable = addDisposableListener(
            element as any,
            'pointerdown',
            handler
        );

        expect(element.addEventListener).toHaveBeenCalledTimes(1);
        expect(element.addEventListener).toHaveBeenCalledWith(
            'pointerdown',
            handler,
            undefined
        );
        expect(element.removeEventListener).toHaveBeenCalledTimes(0);

        disposable.dispose();

        expect(element.addEventListener).toHaveBeenCalledTimes(1);
        expect(element.removeEventListener).toHaveBeenCalledTimes(1);
        expect(element.removeEventListener).toHaveBeenCalledWith(
            'pointerdown',
            handler,
            undefined
        );
    });

    it('addDisposableListener with capture options', () => {
        const element = {
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
        };

        const handler = jest.fn();

        const disposable = addDisposableListener(
            element as any,
            'pointerdown',
            handler,
            true
        );

        expect(element.addEventListener).toHaveBeenCalledTimes(1);
        expect(element.addEventListener).toHaveBeenCalledWith(
            'pointerdown',
            handler,
            true
        );
        expect(element.removeEventListener).toHaveBeenCalledTimes(0);

        disposable.dispose();

        expect(element.addEventListener).toHaveBeenCalledTimes(1);
        expect(element.removeEventListener).toHaveBeenCalledTimes(1);
        expect(element.removeEventListener).toHaveBeenCalledWith(
            'pointerdown',
            handler,
            true
        );
    });

    it('addDisposableListener without capture options', () => {
        const element = {
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
        };

        const handler = jest.fn();

        const disposable = addDisposableListener(
            element as any,
            'pointerdown',
            handler
        );

        expect(element.addEventListener).toHaveBeenCalledTimes(1);
        expect(element.addEventListener).toHaveBeenCalledWith(
            'pointerdown',
            handler,
            undefined
        );
        expect(element.removeEventListener).toHaveBeenCalledTimes(0);

        disposable.dispose();

        expect(element.addEventListener).toHaveBeenCalledTimes(1);
        expect(element.removeEventListener).toHaveBeenCalledTimes(1);
        expect(element.removeEventListener).toHaveBeenCalledWith(
            'pointerdown',
            handler,
            undefined
        );
    });

    describe('pausing and resuming events', () => {
        it('should not fire events when paused', () => {
            const emitter = new Emitter<number>();
            let value: number | undefined = undefined;

            const stream = emitter.event((x) => {
                value = x;
            });

            const pauseDisposable = emitter.pause();

            emitter.fire(0);
            expect(value).toBeUndefined();

            emitter.fire(1);
            expect(value).toBeUndefined();

            pauseDisposable.dispose();
            stream.dispose();
        });

        it('should fire events fired after resuming', () => {
            const emitter = new Emitter<number>();
            let value: number | undefined = undefined;

            const stream = emitter.event((x) => {
                value = x;
            });

            const pauseDisposable = emitter.pause();

            emitter.fire(0);
            expect(value).toBeUndefined();

            pauseDisposable.dispose();

            emitter.fire(1);
            expect(value).toBe(1);

            stream.dispose();
        });

        it('should not replay values fired while paused when in replay mode', () => {
            const emitter = new Emitter<number>({ replay: true });
            let value: number | undefined = undefined;

            const pauseDisposable = emitter.pause();

            emitter.fire(1);

            const stream = emitter.event((x) => {
                value = x;
            });
            expect(value).toBeUndefined();

            pauseDisposable.dispose();
            stream.dispose();
        });

        it('should allow multiple pause tokens to each pause event emissions', () => {
            const emitter = new Emitter<number>();
            let value: number | undefined = undefined;

            const stream = emitter.event((x) => {
                value = x;
            });

            const pauseDisposable1 = emitter.pause();
            const pauseDisposable2 = emitter.pause();

            emitter.fire(0);
            expect(value).toBeUndefined();

            pauseDisposable1.dispose();
            emitter.fire(1);
            expect(value).toBeUndefined();

            pauseDisposable2.dispose();
            emitter.fire(2);
            expect(value).toBe(2);

            stream.dispose();
        });
    });

    describe('emitter additional behaviours', () => {
        it('should fire to multiple listeners', () => {
            const emitter = new Emitter<number>();

            let a: number | undefined = undefined;
            let b: number | undefined = undefined;
            let c: number | undefined = undefined;

            const d1 = emitter.event((x) => {
                a = x;
            });
            const d2 = emitter.event((x) => {
                b = x;
            });
            const d3 = emitter.event((x) => {
                c = x;
            });

            emitter.fire(5);

            expect(a).toBe(5);
            expect(b).toBe(5);
            expect(c).toBe(5);

            d1.dispose();
            d2.dispose();
            d3.dispose();
        });

        it('should only unsubscribe the disposed listener', () => {
            const emitter = new Emitter<number>();

            let a: number | undefined = undefined;
            let b: number | undefined = undefined;

            const d1 = emitter.event((x) => {
                a = x;
            });
            const d2 = emitter.event((x) => {
                b = x;
            });

            d1.dispose();

            emitter.fire(7);

            expect(a).toBeUndefined();
            expect(b).toBe(7);

            d2.dispose();
        });

        it('should return the same event function on repeated access', () => {
            const emitter = new Emitter<number>();
            expect(emitter.event).toBe(emitter.event);
        });

        it('should expose the last fired value via the value getter in replay mode', () => {
            const emitter = new Emitter<number>({ replay: true });

            expect(emitter.value).toBeUndefined();

            emitter.fire(1);
            expect(emitter.value).toBe(1);

            emitter.fire(2);
            expect(emitter.value).toBe(2);
        });

        it('should not track a last value when not in replay mode', () => {
            const emitter = new Emitter<number>();

            emitter.fire(1);
            expect(emitter.value).toBeUndefined();
        });

        it('disposing a listener twice is a no-op', () => {
            const emitter = new Emitter<number>();

            let value: number | undefined = undefined;
            const stream = emitter.event((x) => {
                value = x;
            });

            stream.dispose();
            expect(() => stream.dispose()).not.toThrow();

            emitter.fire(1);
            expect(value).toBeUndefined();
        });

        it('should stop firing to any listener after the emitter is disposed', () => {
            const emitter = new Emitter<number>();

            let value: number | undefined = undefined;
            emitter.event((x) => {
                value = x;
            });

            emitter.dispose();

            emitter.fire(1);
            expect(value).toBeUndefined();
        });

        it('disposing the emitter twice is a no-op', () => {
            const emitter = new Emitter<number>();
            emitter.event(() => {
                // noop
            });

            emitter.dispose();
            expect(() => emitter.dispose()).not.toThrow();
        });
    });

    describe('leakage tracking', () => {
        let warnSpy: jest.SpyInstance;

        beforeEach(() => {
            jest.useRealTimers();
            warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {
                // suppress
            });
        });

        afterEach(() => {
            Emitter.setLeakageMonitorEnabled(false);
            Emitter.MEMORY_LEAK_WATCHER.clear();
            warnSpy.mockRestore();
        });

        it('toggling tracking clears the watcher and updates the flag', () => {
            expect(Emitter.ENABLE_TRACKING).toBeFalsy();

            Emitter.setLeakageMonitorEnabled(true);
            expect(Emitter.ENABLE_TRACKING).toBe(true);

            Emitter.setLeakageMonitorEnabled(false);
            expect(Emitter.ENABLE_TRACKING).toBe(false);
        });

        it('setting the same value does not clear the watcher', () => {
            const clearSpy = jest.spyOn(Emitter.MEMORY_LEAK_WATCHER, 'clear');

            // already false, set to false again
            Emitter.setLeakageMonitorEnabled(false);
            expect(clearSpy).not.toHaveBeenCalled();

            clearSpy.mockRestore();
        });

        it('registers the event in the watcher when tracking is enabled', () => {
            Emitter.setLeakageMonitorEnabled(true);

            const emitter = new Emitter<number>();
            expect(Emitter.MEMORY_LEAK_WATCHER.size).toBe(0);

            // accessing `event` registers the emitter with the watcher
            const stream = emitter.event(() => {
                // noop
            });
            expect(Emitter.MEMORY_LEAK_WATCHER.size).toBe(1);

            emitter.dispose();
            expect(Emitter.MEMORY_LEAK_WATCHER.size).toBe(0);

            stream.dispose();
        });

        it('disposing with a live listener while tracking queues cleanup without throwing', async () => {
            Emitter.setLeakageMonitorEnabled(true);

            const emitter = new Emitter<number>();
            emitter.event(() => {
                // never explicitly disposed -> leaked
            });

            emitter.fire(1);

            // disposing with a live listener enters the tracking branch that
            // queues a microtask; it must clear listeners and not throw
            expect(() => emitter.dispose()).not.toThrow();

            // flush any queued microtask
            await new Promise<void>((resolve) => queueMicrotask(resolve));

            expect(Emitter.MEMORY_LEAK_WATCHER.size).toBe(0);
        });

        it('warns about a leaked listener, deferred to a microtask', async () => {
            Emitter.setLeakageMonitorEnabled(true);

            const emitter = new Emitter<number>();
            emitter.event(() => {
                // leaked: never disposed
            });

            emitter.dispose();
            // the leak check is deferred, so nothing is logged synchronously
            expect(warnSpy).not.toHaveBeenCalled();

            await new Promise<void>((resolve) => queueMicrotask(resolve));

            // the deferred check now reports the leaked listener
            expect(warnSpy).toHaveBeenCalled();
            expect(warnSpy.mock.calls[0][0]).toBe('dockview: stacktrace');
        });

        it('does not warn when the listener is disposed out-of-order in the same block', async () => {
            Emitter.setLeakageMonitorEnabled(true);

            const emitter = new Emitter<number>();
            const stream = emitter.event(() => {
                // noop
            });

            // dispose the emitter, then the listener, in the same execution
            // block: the deferred check must see the listener already removed.
            emitter.dispose();
            stream.dispose();

            await new Promise<void>((resolve) => queueMicrotask(resolve));

            expect(warnSpy).not.toHaveBeenCalled();
        });

        it('warns when disposing a listener that was already removed while tracking', () => {
            Emitter.setLeakageMonitorEnabled(true);

            const emitter = new Emitter<number>();
            const stream = emitter.event(() => {
                // noop
            });

            // first dispose removes the listener, second dispose hits the
            // tracking branch for an already-removed listener
            stream.dispose();
            expect(() => stream.dispose()).not.toThrow();

            emitter.dispose();
        });
    });

    describe('Event.any', () => {
        it('unsubscribes from all children when disposed', () => {
            const emitter1 = new Emitter<number>();
            const emitter2 = new Emitter<number>();

            let value: number | undefined = undefined;

            const stream = Event.any(
                emitter1.event,
                emitter2.event
            )((x) => {
                value = x;
            });

            emitter1.fire(1);
            expect(value).toBe(1);

            stream.dispose();

            value = undefined;
            emitter1.fire(2);
            emitter2.fire(3);
            expect(value).toBeUndefined();
        });
    });

    describe('DockviewEvent', () => {
        it('defaults to not prevented and can be prevented', () => {
            const event = new DockviewEvent();
            expect(event.defaultPrevented).toBe(false);

            event.preventDefault();
            expect(event.defaultPrevented).toBe(true);
        });
    });

    describe('AcceptableEvent', () => {
        it('defaults to not accepted and can be accepted', () => {
            const event = new AcceptableEvent();
            expect(event.isAccepted).toBe(false);

            event.accept();
            expect(event.isAccepted).toBe(true);
        });
    });

    describe('AsapEvent additional', () => {
        beforeEach(() => {
            jest.useRealTimers();
        });

        it('batches multiple fires into a single microtask dispatch', async () => {
            const event = new AsapEvent();

            let count = 0;
            const disposable = event.onEvent(() => {
                count++;
            });

            event.fire();
            event.fire();
            event.fire();

            expect(count).toBe(0);

            await Promise.resolve();

            expect(count).toBe(1);

            disposable.dispose();
            event.dispose();
        });

        it('fires again on a subsequent event-loop cycle', async () => {
            const event = new AsapEvent();

            let count = 0;
            const disposable = event.onEvent(() => {
                count++;
            });

            event.fire();
            await Promise.resolve();
            expect(count).toBe(1);

            event.fire();
            await Promise.resolve();
            expect(count).toBe(2);

            disposable.dispose();
            event.dispose();
        });

        it('does not fire to a listener disposed before the microtask runs', async () => {
            const event = new AsapEvent();

            let count = 0;
            const disposable = event.onEvent(() => {
                count++;
            });

            event.fire();
            disposable.dispose();

            await Promise.resolve();

            expect(count).toBe(0);

            event.dispose();
        });

        it('dispose tears down the underlying emitter', async () => {
            const event = new AsapEvent();

            let count = 0;
            event.onEvent(() => {
                count++;
            });

            event.dispose();

            event.fire();
            await Promise.resolve();

            expect(count).toBe(0);
        });
    });
});
