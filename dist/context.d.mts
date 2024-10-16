declare class Context<T extends object> {
    private object;
    private updateQueue;
    constructor(initialObject?: object);
    get value(): {
        initial: object | undefined;
    } & T;
    reset(initialObject?: object): void;
    update<NewValue extends object>(updateValue: NewValue): Promise<void>;
}

export { Context };
