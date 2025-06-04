type ContextWithDependencies<TContext extends Record<string, unknown>, TDependencies extends string> = Required<Pick<TContext, TDependencies | "initial">> & Partial<Omit<TContext, TDependencies | "initial">>;
/**
 * Represents the options for a task.
 *
 * @template TTaskId - string literal type representing the task ID
 * @template TTaskContext - Type of task context passed into the task execution function
 * @template TTaskReturn - Type of task return value
 * @template TPossibleTaskDependencyId - string literal type representing the possible dependencies of this task
 * @template TInput - Type of the input object passed into the task execution function and error handler
 *
 */
type TaskOptions<TTaskId extends string, TTaskContext extends Record<string, unknown> & {
    initial: unknown;
}, TTaskReturn, TPossibleTaskDependencyId extends string = never, TInput = [TPossibleTaskDependencyId] extends [never] ? TTaskContext : ContextWithDependencies<TTaskContext, TPossibleTaskDependencyId>> = {
    /**
     * The unique ID of the task.
     */
    id: TTaskId;
    /**
     * The dependencies of the task.
     */
    dependencies?: readonly TPossibleTaskDependencyId[];
    enabled?: boolean;
    /**
     * The retry policy for the task.
     *
     * @default { maxRetries: 0, retryDelayMs: 0 }
     */
    retryPolicy?: RetryPolicy;
    /**
     * The function that executes the task.
     * This function receives the task context as input. It can be synchronous or asynchronous.
     *
     * @param ctx - The task context
     * @returns The return value of the task
     * @throws An error if the task execution fails after all retry attempts
     */
    execute: (ctx: TInput) => Promise<TTaskReturn> | TTaskReturn;
    /**
     * An optional error handler for the task.
     * This function receives an error and the context as input. It can be synchronous or asynchronous.
     * When an error handler is provided, it will be invoked when the task execution fails after all retry attempts.
     * The error will still be thrown after the error handler has been executed.
     *
     * @param err - The error that occurred during task execution
     * @param ctx - The task context
     * @returns A promise that resolves when the error has been handled
     * @default console.error
     */
    errorHandler?: (err: Error, ctx: TInput) => Promise<void> | void;
};
/**
 * Represents a task that can be executed. A task takes a context as input,
 * and returns a (potentially void) value when executed.
 *
 * @template TTaskContext - Type of task context
 * @template TTaskReturn - Type of task return value
 */
declare class Task<TTaskContext extends Record<string, unknown> & {
    initial: unknown;
}, TTaskReturn, TPossibleTaskDependencyId extends string = never> {
    #private;
    constructor(options: TaskOptions<string, TTaskContext, TTaskReturn, TPossibleTaskDependencyId>);
    /**
     * Return whether this task is enabled or not
     */
    get isEnabled(): boolean;
    /**
     * Gets the ID of the task.
     *
     * @returns The task ID
     */
    get id(): string;
    /**
     * Executes the task with the given context, retrying if necessary
     * up to the maximum number of retries specified in the retry policy. Each retry
     * is separated by the retry delay (in ms) specified in the retry policy.
     *
     * @param {TTaskContext} ctx - The task context
     * @returns {Promise<TTaskReturn>} A promise that resolves with the task result
     * @throws {Error} If the task execution fails after all retry attempts
     */
    run(ctx: TTaskContext): Promise<TTaskReturn | null>;
    /**
     * Gets the status of the task.
     *
     * @returns The current status of the task
     */
    get status(): TaskStatus;
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
 * - skipped: Task was skipped due to being disabled
 */
type TaskStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export { Task, type TaskOptions };
