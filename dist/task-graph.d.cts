declare class TaskGraph<TTaskDependencies extends Record<string, unknown> = Record<string, never>, TTaskContext extends Record<string, unknown> & {
    initial: unknown;
} = {
    initial: unknown;
}> {
    private _contextValueOrFactory;
    private _dependencies;
    finalize(): TaskGraphBuilder<TTaskDependencies, TTaskContext, string & Exclude<keyof TTaskContext, "initial">>;
    setContext<TNewContext>(valueOrFactory: TNewContext | (() => TNewContext | Promise<TNewContext>)): TaskGraph<TTaskDependencies, {
        initial: TNewContext;
    }>;
    setDependencies<TNewDependencies extends Record<string, unknown>>(value: TNewDependencies): TaskGraph<TNewDependencies, TTaskContext>;
}
declare class TaskGraphBuilder<TTaskDependencies extends Record<string, unknown>, TTaskContext extends Record<string, unknown> & {
    initial: unknown;
}, TAllDependencyIds extends string = string & keyof Omit<TTaskContext, "initial">> {
    private _dependencies;
    private _contextValueOrFactory;
    private readonly _tasks;
    private readonly _topologicalOrder;
    constructor(_dependencies: TTaskDependencies, _contextValueOrFactory: undefined | TTaskContext | (() => TTaskContext | Promise<TTaskContext>));
    addTask<TTaskId extends string, TTaskDependencyIds extends TAllDependencyIds, TTaskReturn>(options: TaskOptions<TTaskId, TTaskDependencies, TTaskContext, TTaskReturn, TTaskDependencyIds>): TaskGraphBuilder<TTaskDependencies, TTaskContext & Partial<{ [K in TTaskId]: TTaskReturn; }>, TAllDependencyIds | TTaskId>;
    build(): TaskGraphRunner<TTaskDependencies, TTaskContext>;
    get size(): number;
    private _topologicalSort;
}
declare class TaskGraphRunner<TTaskDependencies extends Record<string, unknown>, TTaskContext extends Record<string, unknown> & {
    initial: unknown;
}> {
    private _dependencies;
    private _contextValueOrFactory;
    private readonly _topologicalOrder;
    private readonly _tasks;
    private readonly context;
    constructor(_dependencies: TTaskDependencies, _contextValueOrFactory: undefined | TTaskContext | (() => TTaskContext | Promise<TTaskContext>), _topologicalOrder: string[], _tasks: Map<string, Task<TTaskDependencies, TTaskContext, unknown, string>>);
    run: () => Promise<Required<TTaskContext>>;
}
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
}
type RetryPolicy = {
    maxRetries: number;
    retryDelayMs: number;
};
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
type TaskStatus = "pending" | "completed" | "failed" | "running";

export { TaskGraph, TaskGraphRunner };
