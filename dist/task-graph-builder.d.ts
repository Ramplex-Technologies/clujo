import { ITaskGraphBuilder, TaskMap, ITaskGraphBuilderHelper, ITaskGraph, TaskOptions, ITask } from './task-graph.types.js';

declare class TaskGraphBuilder<TDependencies, TContext extends object> implements ITaskGraphBuilder<TDependencies, TContext> {
    private contextValueOrFactory;
    private dependencies;
    finalizeSetup(): TaskGraphBuilderHelper<TDependencies, TContext, {}>;
    setDependencies<TNewDependencies>(value?: undefined | TNewDependencies): ITaskGraphBuilder<TNewDependencies, TContext>;
    setInitialContext<TNewContext extends object>(valueOrFactory?: undefined | TNewContext | (() => TNewContext | Promise<TNewContext>)): ITaskGraphBuilder<TDependencies, TNewContext>;
}
declare class TaskGraphBuilderHelper<TDependencies, TContext extends object, TTaskMap extends TaskMap<TDependencies, TContext>> implements ITaskGraphBuilderHelper<TDependencies, TContext, TTaskMap> {
    private readonly dependencies;
    private readonly contextValueOrFactory;
    private readonly tasks;
    private readonly order;
    constructor(dependencies: TDependencies, contextValueOrFactory: undefined | TContext | (() => TContext | Promise<TContext>));
    get size(): number;
    build(): ITaskGraph<TContext>;
    addTask<TTaskId extends string, TReturn>(options: TaskOptions<TTaskId, TDependencies, TContext, TReturn, keyof TTaskMap>): ITaskGraphBuilderHelper<TDependencies, TContext & Partial<{
        [K in TTaskId]: TReturn;
    }>, TTaskMap & {
        [K in TTaskId]: ITask<TDependencies, TContext & Partial<{
            [K in TTaskId]: TReturn;
        }>, TReturn>;
    }>;
    private topologicalSort;
}

export { TaskGraphBuilder, TaskGraphBuilderHelper };
