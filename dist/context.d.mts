/**
 * Used to allow for the sharing of state between tasks.
 */
declare class Context<T extends object> {
    private object;
    private updateQueue;
    constructor(initialObject?: object);
    /**
     * Gets the current state of the managed object.
     */
    get value(): {
        initial: object | undefined;
    } & T;
    /**
     * Resets the context to its initial state or a new initial object.
     */
    reset(initialObject?: object): void;
    /**
     * Asynchronously updates the context with new values. Ensures that updates are applied in the order they are called.
     */
    update<NewValue extends object>(updateValue: NewValue): Promise<void>;
}

export { Context };
