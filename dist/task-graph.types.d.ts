type RetryPolicy = {
    /**
     * The maximum number of retry attempts after the initial attempt.
     * If set to 0, no retries will be performed.
     */
    maxRetries: number;
    /**
     * The delay in milliseconds between retry attempts.
     * This delay is applied before each retry attempt.
     */
    retryDelayMs: number;
};
interface TaskOptions<TTaskId extends string, TDependencies, TContextInput, TReturn, TDependencyIds> {
    /**
     * Unique identifier for the task.
     * This ID is used to reference the task in dependencies and results.
     */
    id: TTaskId;
    /**
     * Array of task IDs that this task depends on.
     * The task will only execute after all its dependencies have completed successfully.
     */
    dependencies?: TDependencyIds[];
    /**
     * Configuration for retry behavior in case of task failure.
     * If not provided, the task will use the default retry policy (if any) set at the graph level.
     */
    retryPolicy?: RetryPolicy;
    /**
     * Function to execute the task, receiving common dependencies and context as input.
     *
     * @param input - An object containing the task's input.
     * @param input.deps - The common dependencies shared across all tasks.
     * @param input.ctx - The current context, including results from completed dependent tasks.
     * @returns A promise that resolves with the task's result, or the result directly.
     */
    execute: (input: {
        deps: TDependencies;
        ctx: TContextInput;
    }) => Promise<TReturn> | TReturn;
    /**
     * Optional error handler function called when the task fails after all retry attempts.
     *
     * @param err - The error that caused the task to fail.
     * @param input - An object containing the task's input at the time of failure.
     * @param input.deps - The common dependencies shared across all tasks.
     * @param input.ctx - The current context at the time of failure.
     */
    errorHandler?: (err: Error, input: {
        deps: TDependencies;
        ctx: TContextInput;
    }) => Promise<void> | void;
}
type TaskStatus = "pending" | "running" | "completed" | "failed";
interface ITask<TDependencies, TContextInput, TReturn> {
    /**
     * Unique identifier for the task.
     * This ID is used to reference the task in dependencies and results.
     */
    id: string;
    /**
     * Current status of the task.
     */
    status: TaskStatus;
    /**
     * Array of task IDs that this task depends on.
     * The task will only execute after all its dependencies have completed successfully.
     */
    dependencies: string[];
    /**
     * Adds a dependency to the task.
     *
     * @param taskId - The ID of the task to add as a dependency.
     */
    addDependency(taskId: string): void;
    /**
     * Executes the task with the given dependencies and context.
     *
     * @param dependencies - The common dependencies shared across all tasks.
     * @param context - The current context, including results from completed dependent tasks.
     * @returns A promise that resolves with the task's result.
     */
    run(dependencies: TDependencies, context: TContextInput): Promise<TReturn>;
}
type TaskMap<TDependencies, TContext> = {
    [key: string]: ITask<TDependencies, TContext, any>;
};
interface ITaskGraphBuilder<TDependencies, TContext> {
    /**
     * Finalizes the setup and returns a TaskGraphBuilderHelper.
     * Once invoked, the context and dependencies types are locked in.
     *
     * @returns A new ITaskGraphBuilderHelper instance with the current dependencies and context types.
     */
    finalizeSetup(): ITaskGraphBuilderHelper<TDependencies, TContext, {}>;
    /**
     * Sets the dependencies for the task graph.
     * These dependencies will be available to all tasks in the graph.
     *
     * @template TNewDependencies The type of the new dependencies, which must be an object.
     * @param value - The dependencies object to be used across all tasks in the graph.
     * @returns A new ITaskGraphBuilder with updated dependencies type.
     */
    setDependencies<TNewDependencies extends object>(value?: TNewDependencies): ITaskGraphBuilder<TNewDependencies, TContext>;
    /**
     * Sets the initial context for the task graph.
     * This context will be passed to the first task(s) in the graph.
     *
     * @template TNewContext The type of the new context, which must be an object.
     * @param valueOrFactory - The initial context value or a factory function to create it.
     *                         If a function is provided, it can be synchronous or asynchronous.
     * @returns A new ITaskGraphBuilder with updated context type.
     */
    setInitialContext<TNewContext extends object>(valueOrFactory?: TNewContext | (() => TNewContext | Promise<TNewContext>)): ITaskGraphBuilder<TDependencies, TNewContext>;
}
interface ITaskGraphBuilderHelper<TDependencies, TContext, TTaskMap extends TaskMap<TDependencies, TContext>> {
    /**
     * Adds a new task to the task graph.
     *
     * @remarks
     * - The task's result will be added to the context under the key of its task ID.
     * - If the task has no return value, undefined will be added to the context.
     * - Tasks can depend on other tasks, forming a directed acyclic graph (DAG).
     * - Circular dependencies will result in an error during graph construction.
     *
     * @template TTaskId The type of the task ID, which must be a string.
     * @template TReturn The return type of the task.
     * @param options - The options for creating the task.
     * @returns A new ITaskGraphBuilderHelper with the added task and updated context type.
     * @throws {Error} If a task with the same ID already exists.
     */
    addTask<TTaskId extends string, TReturn>(options: TaskOptions<TTaskId, TDependencies, TContext, TReturn, keyof TTaskMap>): ITaskGraphBuilderHelper<TDependencies, TContext & Partial<{
        [K in TTaskId]: TReturn;
    }>, TTaskMap & {
        [K in TTaskId]: ITask<TDependencies, TContext & Partial<{
            [K in TTaskId]: TReturn;
        }>, TReturn>;
    }>;
    /**
     * Builds and returns the final task graph.
     *
     * @remarks
     * - This method finalizes the graph construction and performs topological sorting of tasks.
     * - After calling this method, no more tasks can be added to the graph.
     *
     * @returns The constructed ITaskGraph ready for execution.
     * @throws {Error} If circular dependencies are detected during graph construction.
     */
    build(): ITaskGraph<TContext>;
    /**
     * The number of tasks currently in the graph.
     *
     * @remarks
     * This property can be used to check if any tasks have been added to the graph.
     */
    size: number;
}
interface ITaskGraph<TContext> {
    /**
     * Executes all tasks in the graph and returns the final context.
     *
     * @remarks
     * - Tasks are executed based on their dependencies, with independent tasks potentially running in parallel.
     * - The execution follows the topological order of the task graph.
     * - If a task fails and has no retry policy or exceeds its retry attempts, the graph execution from that point on will fail
     *    and tasks that completed successfully will not be rolled back.
     * - The context is updated after each successful task execution.
     *
     * @returns A promise that resolves to the completed context object after all tasks have been executed.
     *          The returned context includes the results of all tasks, with each task's result
     *          stored under its task ID.
     * @throws {Error} If any task in the graph fails and is not handled by its error handler.
     */
    run(): Promise<Required<TContext>>;
}

export type { ITask, ITaskGraph, ITaskGraphBuilder, ITaskGraphBuilderHelper, RetryPolicy, TaskMap, TaskOptions, TaskStatus };
