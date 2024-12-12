/**
 * Used to track which other tasks must execute before a task
 */
declare class DependencyMap {
    #private;
    add(key: string, value: string): void;
    get(key: string): readonly string[];
}

export { DependencyMap };
