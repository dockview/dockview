import { Observable, Subject, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import {
    AngularDisposable,
    AngularLifecycleManager,
    createAngularDisposable,
} from '../lib/utils/lifecycle-utils';
import { DockviewIDisposable } from 'dockview';

describe('AngularDisposable', () => {
    let disposable: AngularDisposable;

    beforeEach(() => {
        disposable = new AngularDisposable();
    });

    afterEach(() => {
        if (!disposable.isDisposed) {
            disposable.dispose();
        }
    });

    it('should create successfully', () => {
        expect(disposable).toBeDefined();
        expect(disposable.isDisposed).toBe(false);
    });

    it('should mark as disposed after disposal', () => {
        expect(disposable.isDisposed).toBe(false);

        disposable.dispose();

        expect(disposable.isDisposed).toBe(true);
    });

    it('should call dispose callbacks', () => {
        const callback1 = jest.fn();
        const callback2 = jest.fn();

        disposable.addDisposeCallback(callback1);
        disposable.addDisposeCallback(callback2);

        disposable.dispose();

        expect(callback1).toHaveBeenCalledTimes(1);
        expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should call callbacks immediately if already disposed', () => {
        const callback = jest.fn();

        disposable.dispose();
        disposable.addDisposeCallback(callback);

        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple dispose calls', () => {
        const callback = jest.fn();
        disposable.addDisposeCallback(callback);

        disposable.dispose();
        disposable.dispose();
        disposable.dispose();

        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in dispose callbacks', () => {
        const errorCallback = jest.fn(() => {
            throw new Error('Test error');
        });
        const successCallback = jest.fn();
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        disposable.addDisposeCallback(errorCallback);
        disposable.addDisposeCallback(successCallback);

        expect(() => {
            disposable.dispose();
        }).not.toThrow();

        expect(errorCallback).toHaveBeenCalledTimes(1);
        expect(successCallback).toHaveBeenCalledTimes(1);
        expect(consoleSpy).toHaveBeenCalledWith(
            'dockview: error in dispose callback',
            expect.any(Error)
        );

        consoleSpy.mockRestore();
    });

    it('should clear callbacks after disposal', () => {
        const callback = jest.fn();
        disposable.addDisposeCallback(callback);

        disposable.dispose();

        const newCallback = jest.fn();
        disposable.addDisposeCallback(newCallback);

        expect(callback).toHaveBeenCalledTimes(1);
        expect(newCallback).toHaveBeenCalledTimes(1);
    });
});

describe('AngularLifecycleManager', () => {
    let lifecycleManager: AngularLifecycleManager;

    beforeEach(() => {
        lifecycleManager = new AngularLifecycleManager();
    });

    afterEach(() => {
        if (!lifecycleManager.destroy$['closed']) {
            lifecycleManager.destroy();
        }
    });

    it('should create successfully', () => {
        expect(lifecycleManager).toBeDefined();
        expect(lifecycleManager.destroy$).toBeDefined();
        expect(lifecycleManager.destroy$).toBeInstanceOf(Observable);
    });

    it('should emit destroy event when destroyed', (done) => {
        let emitCount = 0;
        lifecycleManager.destroy$.subscribe({
            next: () => {
                emitCount++;
            },
            complete: () => {
                expect(emitCount).toBe(1);
                done();
            },
        });

        lifecycleManager.destroy();
    });

    it('should complete destroy observable when destroyed', (done) => {
        let emitted = false;
        let completed = false;

        lifecycleManager.destroy$.subscribe({
            next: () => {
                emitted = true;
            },
            complete: () => {
                completed = true;
                expect(emitted).toBe(true);
                expect(completed).toBe(true);
                done();
            },
        });

        lifecycleManager.destroy();
    });

    it('should dispose all added disposables', () => {
        const disposable1: DockviewIDisposable = {
            dispose: jest.fn(),
        };
        const disposable2: DockviewIDisposable = {
            dispose: jest.fn(),
        };

        lifecycleManager.addDisposable(disposable1);
        lifecycleManager.addDisposable(disposable2);

        lifecycleManager.destroy();

        expect(disposable1.dispose).toHaveBeenCalledTimes(1);
        expect(disposable2.dispose).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in disposable disposal', () => {
        const errorDisposable: DockviewIDisposable = {
            dispose: jest.fn(() => {
                throw new Error('Disposal error');
            }),
        };
        const successDisposable: DockviewIDisposable = {
            dispose: jest.fn(),
        };

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        lifecycleManager.addDisposable(errorDisposable);
        lifecycleManager.addDisposable(successDisposable);

        expect(() => {
            lifecycleManager.destroy();
        }).not.toThrow();

        expect(errorDisposable.dispose).toHaveBeenCalledTimes(1);
        expect(successDisposable.dispose).toHaveBeenCalledTimes(1);
        expect(consoleSpy).toHaveBeenCalledWith(
            'dockview: error disposing resource',
            expect.any(Error)
        );

        consoleSpy.mockRestore();
    });

    it('should clear disposables after destruction', () => {
        const disposable: DockviewIDisposable = {
            dispose: jest.fn(),
        };

        lifecycleManager.addDisposable(disposable);
        lifecycleManager.destroy();

        expect(disposable.dispose).toHaveBeenCalledTimes(1);
    });

    it('should provide takeUntilDestroy operator', (done) => {
        const source$ = new Subject<number>();
        let receivedValues: number[] = [];
        let completed = false;

        source$.pipe(lifecycleManager.takeUntilDestroy()).subscribe({
            next: (value) => {
                receivedValues.push(value);
            },
            complete: () => {
                completed = true;
                expect(receivedValues).toEqual([1, 2]);
                expect(completed).toBe(true);
                done();
            },
        });

        source$.next(1);
        source$.next(2);

        lifecycleManager.destroy();

        source$.next(3);
        source$.complete();
    });

    it('should work with async observables and takeUntilDestroy', (done) => {
        let receivedCount = 0;
        let completed = false;

        of(1, 2, 3, 4, 5)
            .pipe(delay(10), lifecycleManager.takeUntilDestroy())
            .subscribe({
                next: () => {
                    receivedCount++;
                },
                complete: () => {
                    completed = true;
                    expect(receivedCount).toBe(5);
                    expect(completed).toBe(true);
                    done();
                },
            });
    });

    it('should interrupt long-running observables with takeUntilDestroy', (done) => {
        const source$ = new Subject<number>();
        let receivedValues: number[] = [];
        let completed = false;

        source$.pipe(lifecycleManager.takeUntilDestroy()).subscribe({
            next: (value) => {
                receivedValues.push(value);
            },
            complete: () => {
                completed = true;
                expect(receivedValues).toEqual([1, 2]);
                expect(completed).toBe(true);
                done();
            },
        });

        source$.next(1);
        source$.next(2);

        setTimeout(() => {
            lifecycleManager.destroy();
        }, 10);

        setTimeout(() => {
            source$.next(3);
            source$.next(4);
        }, 20);
    });
});

describe('createAngularDisposable', () => {
    it('should create disposable without callback', () => {
        const disposable = createAngularDisposable();

        expect(disposable).toBeDefined();
        expect(disposable.isDisposed).toBe(false);

        disposable.dispose();
        expect(disposable.isDisposed).toBe(true);
    });

    it('should create disposable with callback', () => {
        const callback = jest.fn();
        const disposable = createAngularDisposable(callback);

        expect(disposable).toBeDefined();
        expect(disposable.isDisposed).toBe(false);

        disposable.dispose();

        expect(disposable.isDisposed).toBe(true);
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle undefined callback gracefully', () => {
        const disposable = createAngularDisposable(undefined);

        expect(disposable).toBeDefined();
        expect(disposable.isDisposed).toBe(false);

        expect(() => {
            disposable.dispose();
        }).not.toThrow();

        expect(disposable.isDisposed).toBe(true);
    });
});

describe('Integration tests', () => {
    it('should work together - lifecycle manager with angular disposables', () => {
        const lifecycleManager = new AngularLifecycleManager();
        const callback1 = jest.fn();
        const callback2 = jest.fn();

        const disposable1 = createAngularDisposable(callback1);
        const disposable2 = createAngularDisposable(callback2);

        lifecycleManager.addDisposable(disposable1);
        lifecycleManager.addDisposable(disposable2);

        expect(disposable1.isDisposed).toBe(false);
        expect(disposable2.isDisposed).toBe(false);

        lifecycleManager.destroy();

        expect(disposable1.isDisposed).toBe(true);
        expect(disposable2.isDisposed).toBe(true);
        expect(callback1).toHaveBeenCalledTimes(1);
        expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should handle mixed disposables', () => {
        const lifecycleManager = new AngularLifecycleManager();

        const angularDisposable = createAngularDisposable(jest.fn());
        const mockDisposable: DockviewIDisposable = {
            dispose: jest.fn(),
        };

        lifecycleManager.addDisposable(angularDisposable);
        lifecycleManager.addDisposable(mockDisposable);

        lifecycleManager.destroy();

        expect(angularDisposable.isDisposed).toBe(true);
        expect(mockDisposable.dispose).toHaveBeenCalledTimes(1);
    });
});
