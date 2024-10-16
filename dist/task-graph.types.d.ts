type RetryPolicy = {
    maxRetries: number;
    retryDelayMs: number;
};
interface TaskOptions<TTaskId extends string, TCommonInput, TContextInput, TReturn, TDependencies> {
    id: TTaskId;
    dependencies?: TDependencies[];
    retryPolicy?: RetryPolicy;
    execute: (input: {
        deps: TCommonInput;
        ctx: TContextInput;
    }) => Promise<TReturn> | TReturn;
    errorHandler?: (err: Error, input: {
        deps: TCommonInput;
        ctx: TContextInput;
    }) => Promise<void> | void;
}
interface ITask<TCommonInput, TContextInput, TReturn> {
    id: string;
    dependencies: string[];
    addDependency(taskId: string): void;
    run(commonInput: TCommonInput, context: TContextInput): Promise<TReturn>;
}
type TaskMap<TDependencies, TContext> = {
    [key: string]: ITask<TDependencies, TContext, any>;
};
interface ITaskGraphBuilder<TDependencies, TContext> {
    finalizeSetup(): ITaskGraphBuilderHelper<TDependencies, TContext, {}>;
    setDependencies<TNewDependencies extends object>(value?: TNewDependencies): ITaskGraphBuilder<TNewDependencies, TContext>;
    setInitialContext<TNewContext extends object>(valueOrFactory?: TNewContext | (() => TNewContext | Promise<TNewContext>)): ITaskGraphBuilder<TDependencies, TNewContext>;
}
interface ITaskGraphBuilderHelper<TDependencies, TContext, TTaskMap extends TaskMap<TDependencies, TContext>> {
    addTask<TTaskId extends string, TReturn>(options: TaskOptions<TTaskId, TDependencies, TContext, TReturn, keyof TTaskMap>): ITaskGraphBuilderHelper<TDependencies, TContext & Partial<{
        [K in TTaskId]: TReturn;
    }>, TTaskMap & {
        [K in TTaskId]: ITask<TDependencies, TContext & Partial<{
            [K in TTaskId]: TReturn;
        }>, TReturn>;
    }>;
    build(): ITaskGraph<TContext>;
    size: number;
}
interface ITaskGraph<TContext> {
    run(): Promise<Required<TContext>>;
}

export type { ITask, ITaskGraph, ITaskGraphBuilder, ITaskGraphBuilderHelper, RetryPolicy, TaskMap, TaskOptions };
