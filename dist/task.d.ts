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
/**
 * Represents a task that can be executed. A task takes a set of dependencies and a context as input,
 * and returns a (potentially void) value when executed.
 *
 * @template TTaskDependencies - Type of task dependencies
 * @template TTaskContext - Type of task context
 * @template TTaskReturn - Type of task return value
 */
declare class Task<TTaskDependencies extends Record<string, unknown>, TTaskContext extends Record<string, unknown> & {
    initial: unknown;
}, TTaskReturn> {
    private readonly options;
    private readonly _dependencies;
    private _retryPolicy;
    private _status;
    constructor(options: TaskOptions<string, TTaskDependencies, TTaskContext, TTaskReturn, string>);
    /**
     * Adds a dependency to the task.
     *
     * @param taskId - The ID of the task to add as a dependency
     */
    addDependency(taskId: string): void;
    /**
     * Gets the list of task dependencies.
     *
     * @returns An array of task IDs representing the dependencies
     */
    get dependencies(): string[];
    /**
     * Gets the ID of the task.
     *
     * @returns The task ID
     */
    get id(): string;
    /**
     * Executes the task with the given dependencies and context, retrying if necessary
     * up to the maximum number of retries specified in the retry policy. Each retry
     * is separated by the retry delay (in ms) specified in the retry policy.
     *
     * @param {TTaskDependencies} deps - The task dependencies
     * @param {TTaskContext} ctx - The task context
     * @returns {Promise<TTaskReturn>} A promise that resolves with the task result
     * @throws {Error} If the task execution fails after all retry attempts
     */
    run(deps: TTaskDependencies, ctx: TTaskContext): Promise<TTaskReturn>;
    /**
     * Gets the status of the task.
     *
     * @returns The current status of the task
     */
    get status(): TaskStatus;
    private _validateRetryPolicy;
}
/**
 * Defines the retry policy for a task.
 */
type RetryPolicy = {
    /**
     * The maximum number of retry attempts.
     */
    maxRetries: number;
    /**
     * The delay in milliseconds between retry attempts.
     */
    retryDelayMs: number;
};
/**
 * Represents the possible states of a task.
 *
 * - pending: Task is pending execution start
 * - running: Task is executing
 * - completed: Task has been executed successfully
 * - failed: Task has failed to execute
 */
type TaskStatus = "pending" | "running" | "completed" | "failed";

export { Task, type TaskOptions };
