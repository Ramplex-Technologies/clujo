import { TaskOptions, Task } from './task.mjs';

declare class TaskGraph<TTaskDependencies extends Record<string, unknown> = Record<string, never>, TTaskContext extends Record<string, unknown> & {
    initial: unknown;
} = {
    initial: unknown;
}> {
    private _contextValueOrFactory;
    private _dependencies;
    /**
     * Finalizes the setup and returns an instance of `TaskGraphBuilder`.
     * Once invoked, the initial context and dependencies are no longer mutable.
     *
     * @returns A new instance of `TaskGraphBuilder` with the current state.
     */
    finalize(): TaskGraphBuilder<TTaskDependencies, TTaskContext, string & Exclude<keyof TTaskContext, "initial">>;
    /**
     * Sets the initial context for the task graph.
     * This context will be passed to the first task(s) in the graph under the `initial` key.
     * Multiple invocation of this method will override the previous context.
     *
     * @template TNewContext The type of the new context.
     * @param valueOrFactory - The initial context value or a factory function to create it.
     *                         If a function is provided, it can be synchronous or asynchronous.
     * @returns A TaskGraph instance with the new context type.
     */
    setContext<TNewContext>(valueOrFactory: TNewContext | (() => TNewContext | Promise<TNewContext>)): TaskGraph<TTaskDependencies, {
        initial: TNewContext;
    }>;
    /**
     * Sets the dependencies for the task graph. These dependencies will be available to all tasks in the graph.
     * Multiple invocation of this method will override the previous dependencies.
     *
     * @template TNewDependencies The type of the new dependencies, which must be an object.
     * @param value - The dependencies object to be used across all tasks in the graph.
     * @returns A TaskGraph instance with the new dependencies type.
     */
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
    /**
     * Adds a new task to the graph.
     *
     * @template TTaskId The ID of the task, which must be unique.
     * @template TTaskDependencyIds The IDs of the task's dependencies.
     * @template TTaskReturn The return type of the task.
     * @param options The configuration options for the task:
     * @param options.id A unique identifier for the task.
     * @param options.execute A function that performs the task's operation. It receives an object with `deps` (dependencies) and `ctx` (context) properties.
     * @param options.dependencies An optional array of task IDs that this task depends on. If not provided, the task will be executed immediately on start.
     * @param options.retryPolicy An optional retry policy for the task, specifying maxRetries and retryDelayMs. Defaults to no retries.
     * @param options.errorHandler An optional function to handle errors that occur during task execution. Defaults to `console.error`.
     *
     * @returns A new instance of `TaskGraphBuilder` with the new task added for chaining.
     *
     * @throws {Error} If a task with the same ID already exists.
     * @throws {Error} If a specified dependency task has not been added to the graph yet.
     *
     * @returns A new instance of `TaskGraphBuilder` with the new task added for chaining.
     */
    addTask<TTaskId extends string, TTaskDependencyIds extends TAllDependencyIds, TTaskReturn>(options: TaskOptions<TTaskId, TTaskDependencies, TTaskContext, TTaskReturn, TTaskDependencyIds>): TaskGraphBuilder<TTaskDependencies, TTaskContext & Partial<{ [K in TTaskId]: TTaskReturn; }>, TAllDependencyIds | TTaskId>;
    /**
     * Builds and returns a TaskGraphRunner instance.
     * This method finalizes the task graph and prepares it for execution by topologically sorting the tasks.
     *
     * @returns A new `TaskGraphRunner` instance ready to execute the task graph.
     *
     * @throws {Error} If no tasks have been added to the graph.
     */
    build(): TaskGraphRunner<TTaskDependencies, TTaskContext>;
    /**
     * Returns the number of tasks in the graph.
     */
    get size(): number;
    /**
     * Topologically sorts the tasks in the graph, placing the sorted order in the `_topologicalOrder` array.
     */
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
    /**
     * Runs the tasks in the graph in topological order.
     * Tasks are run concurrently when possible.
     * In the event a task fails, other independent tasks will continue to run.
     *
     * @returns A promise that resolves to the completed context object when all tasks have completed.
     */
    run(): Promise<TTaskContext>;
}

export { TaskGraph, TaskGraphRunner };
