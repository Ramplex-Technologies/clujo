/**
 * Used to allow for the sharing of state between tasks.
 */
declare class Context<TInitial, TContext> {
    #private;
    constructor(initialValue?: TInitial);
    /**
     * Gets the current state of the managed object.
     */
    get value(): {
        initial: TInitial | undefined;
    } & TContext;
    /**
     * Resets the context to its initial state or a new initial object.
     */
    reset(initialValue: TInitial | undefined): void;
    /**
     * Asynchronously updates the context with new values. Ensures that updates are applied in the order they are called.
     */
    update<NewValue extends object>(updateValue: NewValue): Promise<void>;
}

export { Context };
