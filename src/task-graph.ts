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
import { TaskError } from "./error";

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
        | undefined = undefined;
    readonly #dependencies: TTaskDependencies = Object.create(null);
    readonly #tasks = new Map<string, Task<TTaskDependencies, TTaskContext, unknown, string>>();
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
        // Early return if no options provided
        if (!options) {
            return;
        }

        // Validate dependencies
        if ("dependencies" in options) {
            if (options.dependencies === undefined) {
                this.#dependencies = Object.create(null);
            } else if (!this.#isValidDependencies(options.dependencies)) {
                throw new Error("Dependencies must be a non-null object with defined properties");
            } else {
                this.#dependencies = options.dependencies;
            }
        }

        // Validate only one of the context options
        if ("contextValue" in options && "contextFactory" in options) {
            throw new Error("Cannot specify both contextValue and contextFactory");
        }

        if ("contextValue" in options) {
            if (options.contextValue !== undefined) {
                if (typeof options.contextValue === "function") {
                    throw new Error("Context value must not be a function");
                }
                this.#contextValueOrFactory = options.contextValue;
            }
        } else if ("contextFactory" in options) {
            if (typeof options.contextFactory !== "function") {
                throw new Error("Context factory must be a function that returns a value or Promise");
            }
            this.#contextValueOrFactory = options.contextFactory;
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
    addTask<TTaskId extends string, TTaskReturn, TTaskDependencyIds extends TAllDependencyIds = never>(
        options: TaskOptions<TTaskId, TTaskDependencies, TTaskContext, TTaskReturn, TTaskDependencyIds>,
    ): TaskGraph<
        TTaskDependencies,
        TInitialTaskContext,
        TTaskContext & { readonly [K in TTaskId]?: TTaskReturn },
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
            if ((depId as string) === taskId) {
                throw new Error(`Task ${taskId} cannot depend on itself`);
            }
            const dependentTask = this.#tasks.get(depId);
            if (!dependentTask) {
                throw new Error(`Dependency ${depId} not found for task ${taskId}`);
            }
            task.addDependency(depId);
        }

        // biome-ignore lint/suspicious/noExplicitAny: the typing here is super annoying
        this.#tasks.set(taskId, task as any);
        // biome-ignore lint/suspicious/noExplicitAny: do not want to track the type in two places
        return this as any;
    }

    /**
     * Builds and returns a TaskGraphRunner instance.
     * This method finalizes the task graph and prepares it for execution by topologically sorting the tasks.
     * @param options The configuration options for the build
     * @param options.onTasksCompleted A (sync or async) function to invoke when all tasks have completed
     * @returns A new `TaskGraphRunner` instance ready to execute the task graph.
     *
     * @throws {Error} If no tasks have been added to the graph.
     */
    build({
        onTasksCompleted,
    }: {
        onTasksCompleted?: (
            ctx: DeepReadonly<TTaskContext>,
            deps: TTaskDependencies,
            errors: TaskError[] | null,
        ) => void | Promise<void>;
    } = {}): TaskGraphRunner<TTaskDependencies, TInitialTaskContext, TTaskContext> {
        if (!this.size) {
            throw new Error("Unable to build TaskGraphRunner. No tasks added to the graph");
        }
        if (onTasksCompleted && typeof onTasksCompleted !== "function") {
            throw new Error("onTasksCompleted must be a function (sync or async).");
        }
        this.#topologicalSort();
        return new TaskGraphRunner<TTaskDependencies, TInitialTaskContext, TTaskContext>(
            this.#dependencies,
            this.#contextValueOrFactory,
            this.#topologicalOrder,
            this.#tasks,
            onTasksCompleted,
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

    // validate the dependencies object
    #isValidDependencies(deps: unknown): deps is TTaskDependencies {
        return (
            typeof deps === "object" &&
            deps !== null &&
            !Array.isArray(deps) &&
            Object.entries(deps).every(([key, value]) => typeof key === "string" && value !== undefined)
        );
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
    readonly #tasks: Map<string, Task<TTaskDependencies, TTaskContext, unknown, string>>;
    readonly #onTasksCompleted?: (
        ctx: TTaskContext,
        deps: TTaskDependencies,
        errors: TaskError[] | null,
    ) => void | Promise<void>;
    readonly #errors: TaskError[] = [];

    constructor(
        dependencies: TTaskDependencies,
        contextValueOrFactory:
            | undefined
            | TInitialTaskContext
            | ((
                  deps: TTaskDependencies,
              ) => DeepReadonly<TInitialTaskContext> | Promise<DeepReadonly<TInitialTaskContext>>),
        topologicalOrder: string[],
        tasks: Map<string, Task<TTaskDependencies, TTaskContext, unknown, string>>,
        onTasksCompleted?: (
            ctx: TTaskContext,
            deps: TTaskDependencies,
            errors: TaskError[] | null,
        ) => void | Promise<void>,
    ) {
        this.#dependencies = dependencies;
        this.#contextValueOrFactory = contextValueOrFactory;
        this.#topologicalOrder = topologicalOrder;
        this.#tasks = tasks;
        this.#onTasksCompleted = onTasksCompleted;
    }

    async #run(): Promise<TTaskContext> {
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
            } catch (err) {
                if (err instanceof Error) {
                    this.#errors.push(new TaskError(taskId, err));
                }
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

        if (this.#onTasksCompleted) {
            await this.#onTasksCompleted(
                this.#context.value,
                this.#dependencies,
                this.#errors.length > 0 ? this.#errors : null,
            );
        }

        return this.#context.value;
    }

    /**
     * Runs the tasks in the graph in topological order.
     * Tasks are run concurrently when possible.
     * In the event a task fails, other independent tasks will continue to run.
     *
     * @returns A promise that resolves to the completed context object when all tasks have completed.
     */
    async run() {
        try {
            return await this.#run();
        } finally {
            this.#context.reset(undefined);
        }
    }

    printTaskGraph(clujoId: string): string {
        if (this.#tasks.size === 0) {
            return "Empty task graph";
        }

        const visited = new Set<string>();
        const output: string[] = [`${clujoId} Structure:`];

        // Helper function to create indentation
        const getIndent = (level: number) => "  ".repeat(level);

        // Helper function to print a task and its dependencies recursively
        const printTask = (taskId: string, level = 0, parentChain = new Set<string>()): void => {
            if (parentChain.has(taskId)) {
                output.push(`${getIndent(level)}${taskId} (circular dependency!)`);
                return;
            }

            const task = this.#tasks.get(taskId);
            if (!task) {
                return;
            }

            // Mark as visited
            visited.add(taskId);

            // Print current task
            const prefix = level === 0 ? "└─ " : "├─ ";
            output.push(`${getIndent(level)}${prefix}${taskId}`);

            // Recursively print dependencies
            const newParentChain = new Set(parentChain).add(taskId);
            const dependencies = Array.from(task.dependencies);

            dependencies.forEach((depId, index) => {
                if (!visited.has(depId)) {
                    printTask(depId, level + 1, newParentChain);
                } else {
                    const prefix = index === dependencies.length - 1 ? "└─ " : "├─ ";
                    output.push(`${getIndent(level + 1)}${prefix}${depId} (already shown)`);
                }
            });
        };

        // Find root tasks (tasks with no dependencies)
        const rootTasks = Array.from(this.#tasks.entries())
            .filter(([_, task]) => task.dependencies.length === 0)
            .map(([id]) => id);

        // Print starting from each root task
        for (const taskId of rootTasks) {
            if (!visited.has(taskId)) {
                printTask(taskId);
            }
        }

        // Print any remaining tasks that weren't reached
        this.#tasks.forEach((_, taskId) => {
            if (!visited.has(taskId)) {
                printTask(taskId);
            }
        });

        return output.join("\n");
    }
}
