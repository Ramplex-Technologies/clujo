/* --------------------------------------------------------------------------

  MIT License

  Copyright (c) 2024 Rami Pellumbi

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
-----------------------------------------------------------------------------*/

import { Context } from "./_context";
import { Task, type TaskOptions } from "./_task";

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
export class TaskGraph<
    TTaskDependencies extends Record<string, unknown> = never,
    TInitialTaskContext = undefined,
    TTaskContext extends Record<string, unknown> & { readonly initial: DeepReadonly<TInitialTaskContext> } = {
        readonly initial: DeepReadonly<TInitialTaskContext>;
    },
    TAllDependencyIds extends string & keyof TTaskContext = never,
> {
    readonly #contextValueOrFactory:
        | TInitialTaskContext
        | ((deps: TTaskDependencies) => DeepReadonly<TInitialTaskContext> | Promise<DeepReadonly<TInitialTaskContext>>)
        | undefined;
    readonly #dependencies: TTaskDependencies = Object.create(null);
    readonly #tasks = new Map<string, Task<TTaskDependencies, TTaskContext, unknown>>();
    readonly #topologicalOrder: string[] = [];

    constructor(
        options?:
            | {
                  dependencies?: TTaskDependencies;
                  contextValue?: TInitialTaskContext;
              }
            | {
                  dependencies?: TTaskDependencies;
                  contextFactory: (deps: TTaskDependencies) => TInitialTaskContext | Promise<TInitialTaskContext>;
              },
    ) {
        if (options) {
            if (options.dependencies !== undefined) {
                if (typeof options.dependencies !== "object" || options.dependencies === null) {
                    throw new Error("Dependencies must be a non-null object");
                }
                this.#dependencies = options.dependencies;
            }

            if ("contextValue" in options) {
                this.#contextValueOrFactory = options.contextValue;
            } else if ("contextFactory" in options) {
                this.#contextValueOrFactory = options.contextFactory;
            }
        }
    }

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
    public addTask<TTaskId extends string, TTaskDependencyIds extends TAllDependencyIds, TTaskReturn>(
        options: TaskOptions<TTaskId, TTaskDependencies, TTaskContext, TTaskReturn, TTaskDependencyIds>,
    ): TaskGraph<
        TTaskDependencies,
        TInitialTaskContext,
        TTaskContext & Partial<{ readonly [K in TTaskId]: TTaskReturn }>,
        TAllDependencyIds | TTaskId
    > {
        const taskId = options.id;
        if (this.#tasks.has(taskId)) {
            throw new Error(`Task with id ${taskId} already exists`);
        }

        const task = new Task(options);
        for (const depId of options.dependencies ?? []) {
            if (typeof depId !== "string") {
                throw new Error("Dependency ID must be a string");
            }
            const dependentTask = this.#tasks.get(depId);
            if (!dependentTask) {
                throw new Error(`Dependency ${depId} not found for task ${taskId}`);
            }
            task.addDependency(depId);
        }

        this.#tasks.set(taskId, task);
        return this as unknown as TaskGraph<
            TTaskDependencies,
            TInitialTaskContext,
            TTaskContext &
                Partial<{
                    [K in TTaskId]: TTaskReturn;
                }>,
            TAllDependencyIds | TTaskId
        >;
    }

    /**
     * Builds and returns a TaskGraphRunner instance.
     * This method finalizes the task graph and prepares it for execution by topologically sorting the tasks.
     *
     * @returns A new `TaskGraphRunner` instance ready to execute the task graph.
     *
     * @throws {Error} If no tasks have been added to the graph.
     */
    public build(
        {
            onTaskCompletion,
        }: {
            onTaskCompletion?: (ctx: TTaskContext) => void | Promise<void>;
        } = {
            onTaskCompletion: undefined,
        },
    ): TaskGraphRunner<TTaskDependencies, TInitialTaskContext, TTaskContext> {
        if (!this.size) {
            throw new Error("Unable to build TaskGraphRunner. No tasks added to the graph");
        }
        if (onTaskCompletion && typeof onTaskCompletion !== "function") {
            throw new Error("onTaskCompletion must be a function (sync or async).");
        }
        this.#topologicalSort();
        return new TaskGraphRunner<TTaskDependencies, TInitialTaskContext, TTaskContext>(
            this.#dependencies,
            this.#contextValueOrFactory,
            this.#topologicalOrder,
            this.#tasks,
            onTaskCompletion,
        );
    }

    /**
     * Returns the number of tasks in the graph.
     */
    get size(): number {
        return this.#tasks.size;
    }

    /**
     * Topologically sorts the tasks in the graph, placing the sorted order in the `_topologicalOrder` array.
     */
    #topologicalSort() {
        const visited = new Set<string>();
        const temp = new Set<string>();

        const visit = (taskId: string) => {
            if (temp.has(taskId)) {
                throw new Error(`Circular dependency detected involving task ${taskId}`);
            }
            if (!visited.has(taskId)) {
                temp.add(taskId);
                const task = this.#tasks.get(taskId);
                if (!task) {
                    throw new Error(`Task ${taskId} not found`);
                }
                for (const depId of task.dependencies) {
                    visit(depId);
                }
                temp.delete(taskId);
                visited.add(taskId);
                this.#topologicalOrder.push(taskId);
            }
        };

        for (const taskId of this.#tasks.keys()) {
            if (!visited.has(taskId)) {
                visit(taskId);
            }
        }
        visited.clear();
        temp.clear();
    }
}

/**
 * Represents a task graph runner that executes tasks in a topologically sorted order.
 * It assumes the passed tasks are already topologically sorted.
 *
 * @template TTaskDependencies - Type of the dependencies each task will receive
 * @template TTaskContext - Type of the context each task will receive
 */
export class TaskGraphRunner<
    TTaskDependencies extends Record<string, unknown>,
    TInitialTaskContext,
    TTaskContext extends Record<string, unknown> & { initial: unknown },
> {
    readonly #context = new Context<TInitialTaskContext, TTaskContext>();
    readonly #dependencies: TTaskDependencies;
    readonly #contextValueOrFactory:
        | undefined
        | TInitialTaskContext
        | ((deps: TTaskDependencies) => DeepReadonly<TInitialTaskContext> | Promise<DeepReadonly<TInitialTaskContext>>);
    readonly #topologicalOrder: string[];
    readonly #tasks: Map<string, Task<TTaskDependencies, TTaskContext, unknown>>;
    readonly #onTaskCompletion?: (ctx: TTaskContext) => void | Promise<void>;

    constructor(
        dependencies: TTaskDependencies,
        contextValueOrFactory:
            | undefined
            | TInitialTaskContext
            | ((
                  deps: TTaskDependencies,
              ) => DeepReadonly<TInitialTaskContext> | Promise<DeepReadonly<TInitialTaskContext>>),
        topologicalOrder: string[],
        tasks: Map<string, Task<TTaskDependencies, TTaskContext, unknown>>,
        onTaskCompletion?: (ctx: TTaskContext) => void | Promise<void>,
    ) {
        this.#dependencies = dependencies;
        this.#contextValueOrFactory = contextValueOrFactory;
        this.#topologicalOrder = topologicalOrder;
        this.#tasks = tasks;
        this.#onTaskCompletion = onTaskCompletion;
    }

    /**
     * Runs the tasks in the graph in topological order.
     * Tasks are run concurrently when possible.
     * In the event a task fails, other independent tasks will continue to run.
     *
     * @returns A promise that resolves to the completed context object when all tasks have completed.
     */
    async run(): Promise<TTaskContext> {
        if (this.#topologicalOrder.length === 0) {
            throw new Error("No tasks to run. Did you forget to call topologicalSort?");
        }

        let value: TInitialTaskContext | undefined;
        if (this.#contextValueOrFactory) {
            value =
                typeof this.#contextValueOrFactory === "function"
                    ? await (
                          this.#contextValueOrFactory as (
                              deps: TTaskDependencies,
                          ) => TInitialTaskContext | Promise<TInitialTaskContext>
                      )(this.#dependencies)
                    : this.#contextValueOrFactory;
        }
        this.#context.reset(value);

        const completed = new Set<string>();
        const running = new Map<string, Promise<void>>();
        const readyTasks = new Set<string>(
            this.#topologicalOrder.filter((taskId) => {
                const task = this.#tasks.get(taskId);
                if (!task) {
                    throw new Error(`Task ${taskId} not found`);
                }
                return task.dependencies.length === 0;
            }),
        );

        const runTask = async (taskId: string) => {
            const task = this.#tasks.get(taskId);
            if (!task) {
                throw new Error(`Task ${taskId} not found`);
            }

            try {
                const result = await task.run(this.#dependencies, this.#context.value);
                await this.#context.update({ [taskId]: result });
                completed.add(taskId);
            } catch {
                // completed in the sense that we won't try to run it again
                completed.add(taskId);
            } finally {
                running.delete(taskId);

                // Check if any dependent tasks are now ready to run
                for (const [id, t] of this.#tasks) {
                    if (!completed.has(id) && !running.has(id)) {
                        const canRun = t.dependencies.every((depId) => {
                            const depTask = this.#tasks.get(depId);
                            return depTask && completed.has(depId) && depTask.status === "completed";
                        });
                        if (canRun) {
                            readyTasks.add(id);
                        }
                    }
                }
            }
        };

        while (completed.size < this.#tasks.size) {
            // Start all ready tasks
            for (const taskId of readyTasks) {
                readyTasks.delete(taskId);
                const promise = runTask(taskId);
                running.set(taskId, promise);
            }

            // Wait for at least one task to complete
            if (running.size > 0) {
                await Promise.race(running.values());
            } else {
                // no tasks are running and we have not completed all tasks
                // happens when tasks could not run due to failed dependencies
                break;
            }
        }

        if (this.#onTaskCompletion) {
            await this.#onTaskCompletion(this.#context.value);
        }

        return this.#context.value;
    }
}
