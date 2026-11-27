export function tail<T>(arr: T[]): [T[], T] {
    if (arr.length === 0) {
        throw new Error('Invalid tail call');
    }

    return [arr.slice(0, arr.length - 1), arr[arr.length - 1]];
}

export function last<T>(arr: T[]): T | undefined {
    return arr.length > 0 ? arr[arr.length - 1] : undefined;
}

export function sequenceEquals<T>(arr1: T[], arr2: T[]): boolean {
    if (arr1.length !== arr2.length) {
        return false;
    }

    for (let i = 0; i < arr1.length; i++) {
        if (arr1[i] !== arr2[i]) {
            return false;
        }
    }
    return true;
}

/**
 * Pushes an element to the start of the array, if found.
 */
export function pushToStart<T>(arr: T[], value: T): void {
    const index = arr.indexOf(value);

    if (index > -1) {
        arr.splice(index, 1);
        arr.unshift(value);
    }
}

/**
 * Pushes an element to the end of the array, if found.
 */
export function pushToEnd<T>(arr: T[], value: T): void {
    const index = arr.indexOf(value);

    if (index > -1) {
        arr.splice(index, 1);
        arr.push(value);
    }
}

export function firstIndex<T>(
    array: T[] | ReadonlyArray<T>,
    fn: (item: T) => boolean
): number {
    for (let i = 0; i < array.length; i++) {
        const element = array[i];

        if (fn(element)) {
            return i;
        }
    }

    return -1;
}

export function remove<T>(array: T[], value: T): boolean {
    const index = array.indexOf(value);

    if (index > -1) {
        array.splice(index, 1);
        return true;
    }
    return false;
}

/** The items of the longest run whose `key` strictly increases, in order. */
export function longestIncreasingRun<T>(
    items: readonly T[],
    key: (item: T) => number
): Set<T> {
    // tails[k]: index of the smallest last item of a run of length k + 1
    const tails: number[] = [];
    const parent: number[] = new Array(items.length).fill(-1);
    items.forEach((item, i) => {
        const value = key(item);
        let lo = 0;
        let hi = tails.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (key(items[tails[mid]]) < value) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        parent[i] = lo > 0 ? tails[lo - 1] : -1;
        tails[lo] = i;
    });
    const run = new Set<T>();
    for (
        let i = tails.length > 0 ? tails[tails.length - 1] : -1;
        i !== -1;
        i = parent[i]
    ) {
        run.add(items[i]);
    }
    return run;
}
