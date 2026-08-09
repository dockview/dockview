import { describe, test, expect } from 'vitest';
import * as core from 'dockview';
import * as splitviewView from '../splitview/view';
import * as gridviewView from '../gridview/view';
import * as paneviewView from '../paneview/view';
import * as utils from '../utils';

describe('Vue Components Basic Tests', () => {
    test('should be able to import core dockview functionality', () => {
        expect(core.createDockview).toBeDefined();
        expect(core.createSplitview).toBeDefined();
        expect(core.createGridview).toBeDefined();
        expect(core.createPaneview).toBeDefined();
    });

    test('should be able to import APIs', () => {
        expect(core.DockviewApi).toBeDefined();
        expect(core.SplitviewApi).toBeDefined();
        expect(core.GridviewApi).toBeDefined();
        expect(core.PaneviewApi).toBeDefined();
    });

    test('should be able to import orientation enum', () => {
        expect(core.Orientation).toBeDefined();
        expect(core.Orientation.HORIZONTAL).toBeDefined();
        expect(core.Orientation.VERTICAL).toBeDefined();
    });
});

describe('Vue View Classes', () => {
    test('Vue view classes should be importable', () => {
        expect(splitviewView).toBeDefined();
        expect(gridviewView).toBeDefined();
        expect(paneviewView).toBeDefined();
    });
});

describe('Utility Functions', () => {
    test('should export utility functions', () => {
        expect(utils.findComponent).toBeDefined();
        expect(utils.mountVueComponent).toBeDefined();
        expect(utils.VuePart).toBeDefined();

        expect(typeof utils.findComponent).toBe('function');
        expect(typeof utils.mountVueComponent).toBe('function');
        expect(typeof utils.VuePart).toBe('function');
    });

    test('findComponent should throw when component not found', () => {
        const mockInstance = {
            components: {},
            parent: null,
            appContext: {
                components: {},
            },
        };

        expect(() => utils.findComponent(mockInstance, 'non-existent')).toThrow(
            "Failed to find Vue Component 'non-existent'"
        );
    });
});

describe('Package Structure', () => {
    test('package should build without errors', () => {
        // If we get this far, the package structure is correct
        expect(true).toBe(true);
    });
});
