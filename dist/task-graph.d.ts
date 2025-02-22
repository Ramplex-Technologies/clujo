import { DependencyMap } from './_dependency-map.js';
import { TaskOptions, Task } from './_task.js';
import { TaskError } from './error.js';

type DeepReadonly<T> = {
    readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};
/**
 * Represents a task graph which tasks can be added to
 * When built, the graph will be sorted topologically and returned as a `TaskGraphRunner` instance.
 *
 * @template TTaskDependencies - Type of the dependencies each task will receive
 * @template TInitialTaskContext - Type of the context in the `initial` key that each task will receive
 * @template TTaskContext - Type of the context each task will receive
 * @template TAllDependencyIds - The task IDs that can be used as dependencies for new tasks
 */
declare class TaskGraph<TTaskDependencies extends Record<string, unknown> = never, TInitialTaskContext = undefined, TTaskContext extends Record<string, unknown> & {
    readonly initial: DeepReadonly<TInitialTaskContext>;
} = {
    readonly initial: DeepReadonly<TInitialTaskContext>;
}, TAllDependencyIds extends string & keyof TTaskContext = never> {
    #private;
    constructor(options?: {
        dependencies?: TTaskDependencies;
        contextValue?: TInitialTaskContext;
    } | {
        dependencies?: TTaskDependencies;
        contextFactory: (deps: TTaskDependencies) => TInitialTaskContext | Promise<TInitialTaskContext>;
    });
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
     * @returns The instance of `TaskGraph` with the new task added for chaining.
     *
     * @throws {Error} If a task with the same ID already exists.
     * @throws {Error} If a specified dependency task has not been added to the graph yet.
     */
    addTask<TTaskId extends string, TTaskReturn, TTaskDependencyIds extends TAllDependencyIds = never>(options: TaskOptions<TTaskId, TTaskDependencies, TTaskContext, TTaskReturn, TTaskDependencyIds>): TaskGraph<TTaskDependencies, TInitialTaskContext, TTaskContext & {
        readonly [K in TTaskId]?: TTaskReturn;
    }, TAllDependencyIds | TTaskId>;
    /**
     * Builds and returns a TaskGraphRunner instance.
     * This method finalizes the task graph and prepares it for execution by topologically sorting the tasks.
     * @param options The configuration options for the build
     * @param options.onTasksCompleted A (sync or async) function to invoke when all tasks have completed
     * @returns A new `TaskGraphRunner` instance ready to execute the task graph.
     *
     * @throws {Error} If no tasks have been added to the graph.
     */
    build({ onTasksCompleted, }?: {
        onTasksCompleted?: (ctx: DeepReadonly<TTaskContext>, deps: TTaskDependencies, errors: TaskError[] | null) => void | Promise<void>;
    }): TaskGraphRunner<TTaskDependencies, TInitialTaskContext, TTaskContext>;
    /**
     * Returns the number of tasks in the graph.
     */
    get size(): number;
}
/**
 * Represents a task graph runner that executes tasks in a topologically sorted order.
 * It assumes the passed tasks are already topologically sorted.
 *
 * @template TTaskDependencies - Type of the dependencies each task will receive
 * @template TTaskContext - Type of the context each task will receive
 */
declare class TaskGraphRunner<TTaskDependencies extends Record<string, unknown>, TInitialTaskContext, TTaskContext extends Record<string, unknown> & {
    initial: unknown;
}> {
    #private;
    constructor(dependencies: TTaskDependencies, contextValueOrFactory: undefined | TInitialTaskContext | ((deps: TTaskDependencies) => DeepReadonly<TInitialTaskContext> | Promise<DeepReadonly<TInitialTaskContext>>), topologicalOrder: string[], tasks: Map<string, Task<TTaskDependencies, TTaskContext, unknown, string>>, taskDependencies: DependencyMap, onTasksCompleted?: (ctx: TTaskContext, deps: TTaskDependencies, errors: TaskError[] | null) => void | Promise<void>);
    /**
     * Runs the tasks in the graph in topological order.
     * Tasks are run concurrently when possible.
     * In the event a task fails, other independent tasks will continue to run.
     *
     * @returns A promise that resolves to the completed context object when all tasks have completed.
     */
    trigger(): Promise<TTaskContext>;
    printTaskGraph(): string;
}

export { TaskGraph, TaskGraphRunner };
