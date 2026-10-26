import {
    firstIndex,
    last,
    pushToEnd,
    pushToStart,
    remove,
    sequenceEquals,
    tail,
} from '../array';

describe('array', () => {
    test('tail', () => {
        expect(tail([1, 2, 3, 4, 5])).toEqual([[1, 2, 3, 4], 5]);
        expect(tail([1, 2])).toEqual([[1], 2]);
        expect(tail([1])).toEqual([[], 1]);
        expect(() => tail([])).toThrow('Invalid tail call');
    });

    test('last', () => {
        expect(last([1, 2, 3, 4])).toBe(4);
        expect(last([])).toBeUndefined();
    });

    test('pushToEnd', () => {
        const arr1 = [1, 2, 3, 4];
        pushToEnd(arr1, 3);
        expect(arr1).toEqual([1, 2, 4, 3]);
        pushToEnd(arr1, 5);
        expect(arr1).toEqual([1, 2, 4, 3]);
    });

    test('pushToStart', () => {
        const arr1 = [1, 2, 3, 4];
        pushToStart(arr1, 3);
        expect(arr1).toEqual([3, 1, 2, 4]);
        pushToStart(arr1, 5);
        expect(arr1).toEqual([3, 1, 2, 4]);
    });

    test('firstIndex', () => {
        expect(firstIndex([1, 2, 3, 4, 3], (item) => item === 3)).toBe(2);
        expect(firstIndex([1, 2, 3, 4, 3], (item) => item === 5)).toBe(-1);
    });

    test('sequenceEquals', () => {
        expect(sequenceEquals([1, 2, 3, 4], [1, 2, 3, 4])).toBeTruthy();
        expect(sequenceEquals([1, 2, 3, 4], [4, 3, 2, 1])).toBeFalsy();
        expect(sequenceEquals([1, 2, 3, 4], [1, 2, 3])).toBeFalsy();
        expect(sequenceEquals([1, 2, 3, 4], [1, 2, 3, 4, 5])).toBeFalsy();
    });

    test('remove', () => {
        const arr1 = [1, 2, 3, 4];
        remove(arr1, 2);
        expect(arr1).toEqual([1, 3, 4]);

        const arr2 = [1, 2, 2, 3, 4];
        remove(arr2, 2);
        expect(arr2).toEqual([1, 2, 3, 4]);

        const arr3 = [1];
        remove(arr3, 2);
        expect(arr3).toEqual([1]);
        remove(arr3, 1);
        expect(arr3).toEqual([]);
        remove(arr3, 1);
        expect(arr3).toEqual([]);
    });
});
