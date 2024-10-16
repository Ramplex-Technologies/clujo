import { CronOptions } from 'croner';
import Redis from 'ioredis';
import { LockOptions, Mutex } from 'redis-semaphore';
import { RetryPolicy, TaskMap, ITask } from './task-graph.types.mjs';

interface IClujoStart {
    /**
     * Sets the schedule for the Clujo using a cron pattern.
     * @param {string} pattern - The cron pattern to define the schedule.
     * @param {CronOptions} [options] - Optional configuration for the cron job.
     * @returns {IClujoBuilder<void, undefined>} A builder instance for further configuration.
     */
    setSchedule(pattern: string, options?: CronOptions): IClujoBuilder<void, {}>;
}
interface IClujoBuilder<TDependencies, TContext extends object> {
    /**
     * Builds the Clujo instance with the configured settings.
     * Once a Clujo is created, tasks can be added to it, and it can be started.
     * @returns {IClujo<TDependencies, TContext>} The built Clujo instance.
     */
    build(): IClujo<TDependencies, TContext, {}>;
    /**
     * Configures the Clujo to run immediately upon startup as well as on the schedule.
     * @returns {IClujoBuilder<TDependencies, TContext>} The builder instance for method chaining.
     */
    runOnStartup(): IClujoBuilder<TDependencies, TContext>;
    /**
     * Sets the initial context object for the Clujo. A context is a value store in Clujo that is passed between tasks.
     * A task adds its result to the context under the key of its task ID. In the event the task has no return, the value is undefined.
     *
     * @remarks
     *   - The context can be an object or a (sync or async) function that returns an object.
     *   - When no context is set, the context will be an empty object for the first task.
     *   - When a context is set, it will always be set to the initial value before running the tasks.
     *   - If some task `i` depends on tasks `j_1, j_2, ..., j_n`, the context passed to task `i` will be guaranteed to include the results of tasks `j_1, j_2, ..., j_n`.
     *   - If a task has no dependencies, it has guaranteed access only to the initial context.
     * @template TNewContext The type of the new context.
     * @param {TNewContext | (() => TNewContext | Promise<TNewContext>)} valueOrFactory - The context value or a factory function that returns the context.
     * @returns {IClujoBuilder<TDependencies, TNewContext>} The builder instance with the new context type.
     */
    setInitialContext<TNewContext>(valueOrFactory: TNewContext | (() => TNewContext | Promise<TNewContext>)): IClujoBuilder<TDependencies, {
        initial: TNewContext;
    }>;
    /**
     * Sets the dependencies for the Clujo.
     * @template TNewDependencies The type of the new dependencies, which must be an object.
     * @param {TNewDependencies} deps - The dependencies object to be used by the Clujo. All tasks will be able to access these dependencies.
     * @returns {IClujoBuilder<TNewDependencies, TContext>} The builder instance with the new dependencies type.
     */
    setDependencies<TNewDependencies extends object>(deps: TNewDependencies): IClujoBuilder<TNewDependencies, TContext>;
    /**
     * Sets the retry policy for the Clujo.
     *
     * @remarks
     *  - The retry policy is applied to all tasks in the Clujo.
     *  - A task can override the Clujo's retry policy by providing its own retry policy.
     *
     * @param {RetryPolicy} policy - The retry policy to be applied to the Clujo.
     * @param {number} [policy.maxRetries] - The maximum number of retries to attempt.
     * @param {number} [policy.retryDelayMs] - The delay in milliseconds between retries.
     * @returns {IClujoBuilder<TDependencies, TContext>} The builder instance for method chaining.
     */
    setRetryPolicy(policy: RetryPolicy): IClujoBuilder<TDependencies, TContext>;
}
interface IClujo<TDependencies, TContext, TTaskMap extends TaskMap<TDependencies, TContext>> {
    /** The unique identifier for the Clujo instance. */
    readonly id: string;
    /**
     * Adds a task to the Clujo's execution sequence.
     *
     * @remarks
     * - case: N tasks each with no dependencies -> all tasks run concurrently
     * - case: N tasks where task i depends on task i-1, i=1,...,N -> all tasks run sequentially
     * - case: 1 <= i != j <= N. N tasks where task i depends on task j. N\{i} tasks run concurrently, task i runs after task j
     * - case: Task i depends on task j, task j depends on task i -> error
     *
     * @template TNewContext The type of the new context returned by the task.
     * @param {TaskOptions<TDependencies, TContext, TNewContext>} options - The task configuration.
     * @param {string} options.taskId - The unique identifier for the task.
     * @param {TExecute<TDependencies, TContext, TNewContext>} options.execute - The task execution function.
     * @param {TErrorHandler<TDependencies, TContext>} [options.errorHandler] (optional) - The error handler function. Defaults to logging the error.
     * @param {RetryPolicy} [options.retryPolicy] (optional) - The retry policy for the task. Defaults to the Clujo's retry policy.
     * @param {Array<keyof TTaskMap>} [options.dependencies] (optional) - The task IDs that this task depends on. If not provided, the task will run with no dependencies.
     * @returns {IClujo<TDependencies, TNewContext>} A new IClujo instance with the updated context type.
     * @throws {Error} If the Clujo is already running.
     */
    addTask<TTaskId extends string, TNewContext>({ taskId, execute, errorHandler, retryPolicy, dependencies, }: {
        taskId: TTaskId;
        execute: TExecute<TDependencies, TContext, TNewContext>;
        errorHandler?: TErrorHandler<TDependencies, TContext>;
        retryPolicy?: RetryPolicy;
        dependencies?: Array<keyof TTaskMap>;
    }): IClujo<TDependencies, TContext & Partial<{
        [K in TTaskId]: TNewContext extends void ? undefined : TNewContext;
    }>, TTaskMap & {
        [K in TTaskId]: ITask<TDependencies, TNewContext, TContext & Partial<{
            [K in TTaskId]: TNewContext extends void ? undefined : TNewContext;
        }>>;
    }>;
    /**
     * Starts the Clujo execution.
     *
     * @remarks
     * - Initializes the Clujo and begins its scheduled execution.
     * - If Redis is provided, uses distributed locking to ensure only one instance of a clujo with the same id runs at a time.
     * - If configured to run on startup, triggers immediate execution.
     * - Can only be called once per Clujo instance.
     *
     * @param {StartOptions} [options] - Optional configuration for starting the Clujo.
     * @param {Redis} options.redis - Redis instance for distributed locking.
     * @param {LockOptions} [options.options] - Optional lock configuration.
     * @returns {IClujo<TDependencies, TContext>} The started Clujo instance.
     * @throws {Error} If the Clujo has already been started.
     */
    start(options?: StartOptions<TContext>): IClujo<TDependencies, TContext, TTaskMap>;
    /**
     * Stops the Clujo execution. If the Clujo is currently running, it will complete the current task before stopping.
     *
     * @returns {Promise<void>} A promise that resolves when the Clujo has been stopped.
     * @throws {Error} If the Clujo has not been started.
     */
    stop(): Promise<void>;
    /**
     * Triggers an immediate execution of the Clujo tasks.
     *
     * @remarks
     * - Initiates an immediate run of the Clujo's task sequence outside of its scheduled execution.
     * - Can be used to manually trigger the Clujo at any time after it has been started.
     * - If the Clujo is currently executing, the behavior of this depends on the whether Redis is used for locking and the `protect` cron option is set.
     *
     * @returns {Promise<void>} A promise that resolves when the triggered execution is complete.
     * @throws {Error} If the Clujo has not been started.
     */
    trigger(): Promise<void>;
}
type TExecute<TDependencies, TContext, TReturn> = ({ deps, ctx, }: {
    deps: TDependencies;
    ctx: TContext;
}) => Promise<TReturn> | TReturn;
type TErrorHandler<TDependencies, TContext> = (err: Error, { deps, ctx, }: {
    deps: TDependencies;
    ctx: TContext;
}) => Promise<void> | void;
interface StartOptions<TContext> {
    completionHandler?: (ctx: Required<TContext>) => Promise<void> | void;
    redis?: Redis;
    options?: LockOptions;
}
interface ILock extends AsyncDisposable {
    mutex: Mutex;
}

export type { IClujo, IClujoBuilder, IClujoStart, ILock, StartOptions, TErrorHandler, TExecute };
