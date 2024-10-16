import { ITaskGraph, ITask } from './task-graph.types.mjs';

declare class TaskGraph<TDependencies, TContext extends object> implements ITaskGraph<TContext> {
    private readonly taskDependencies;
    private readonly contextValueOrFactory;
    private readonly tasks;
    private readonly order;
    private readonly context;
    constructor(taskDependencies: TDependencies, contextValueOrFactory: undefined | TContext | (() => TContext | Promise<TContext>), tasks: Map<string, ITask<TDependencies, TContext, unknown>>, order: string[]);
    run: () => Promise<Required<TContext>>;
}

export { TaskGraph };
