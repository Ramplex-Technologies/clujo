type TaskOptions<TTaskId extends string, TTaskDependencies extends Record<string, unknown>, TTaskContext extends Record<string, unknown> & {
    initial: unknown;
}, TTaskReturn, TPossibleTaskDependencyId extends string = never, TInput = {
    deps: TTaskDependencies;
    ctx: TTaskContext;
}> = {
    id: TTaskId;
    dependencies?: TPossibleTaskDependencyId[];
    retryPolicy?: RetryPolicy;
    execute: (input: TInput) => Promise<TTaskReturn> | TTaskReturn;
    errorHandler?: (err: Error, input: TInput) => Promise<void> | void;
};
declare class Task<TTaskDependencies extends Record<string, unknown>, TTaskContext extends Record<string, unknown> & {
    initial: unknown;
}, TTaskReturn, TPossibleTaskId> {
    private readonly options;
    private readonly _dependencies;
    private _retryPolicy;
    private _status;
    constructor(options: TaskOptions<string, TTaskDependencies, TTaskContext, TTaskReturn, string>);
    addDependency(taskId: TPossibleTaskId): void;
    get dependencies(): TPossibleTaskId[];
    get id(): string;
    run(deps: TTaskDependencies, ctx: TTaskContext): Promise<TTaskReturn>;
    get status(): TaskStatus;
    private _validateRetryPolicy;
}
type TaskStatus = "pending" | "completed" | "failed" | "running";
type RetryPolicy = {
    maxRetries: number;
    retryDelayMs: number;
};

export { Task, type TaskOptions };
