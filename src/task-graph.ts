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

import { promisify } from "node:util";
import { Context } from "./context";

const sleep = promisify(setTimeout);

export class TaskGraph<
  TTaskDependencies extends Record<string, unknown> = Record<string, never>,
  TTaskContext extends Record<string, unknown> & { initial: unknown } = { initial: unknown },
> {
  // start with an undefined context value (placed under key initial)
  private _contextValueOrFactory: unknown = undefined;
  // start with an empty dependencies object
  private _dependencies: unknown = Object.create(null);

  /**
   * Finalizes the setup and returns an instance of `TaskGraphBuilder`.
   * Once invoked, the initial context and dependencies are no longer mutable.
   *
   * @returns A new instance of `TaskGraphBuilder` with the current state.
   */
  public finalize() {
    // return a new instance of TaskGraph with the current state
    return new TaskGraphBuilder<TTaskDependencies, TTaskContext>(
      this._dependencies as TTaskDependencies,
      this._contextValueOrFactory as undefined | TTaskContext | (() => TTaskContext | Promise<TTaskContext>),
    );
  }

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
  public setContext<TNewContext>(valueOrFactory: TNewContext | (() => TNewContext | Promise<TNewContext>)) {
    // set the context value to the provided value or factory
    this._contextValueOrFactory = valueOrFactory;
    // return the builder with the new context type
    return this as unknown as TaskGraph<TTaskDependencies, { initial: TNewContext }>;
  }

  /**
   * Sets the dependencies for the task graph. These dependencies will be available to all tasks in the graph.
   * Multiple invocation of this method will override the previous dependencies.
   *
   * @template TNewDependencies The type of the new dependencies, which must be an object.
   * @param value - The dependencies object to be used across all tasks in the graph.
   * @returns A TaskGraph instance with the new dependencies type.
   */
  public setDependencies<TNewDependencies extends Record<string, unknown>>(value: TNewDependencies) {
    if (typeof value !== "object" || value === null) throw new Error("Initial dependencies must be an object");
    // set the dependencies object to the provided value
    this._dependencies = value as unknown as TTaskDependencies;
    // return the builder with the new dependencies type
    return this as unknown as TaskGraph<TNewDependencies, TTaskContext>;
  }
}

class TaskGraphBuilder<
  TTaskDependencies extends Record<string, unknown>,
  TTaskContext extends Record<string, unknown> & { initial: unknown },
  TAllDependencyIds extends string = string & keyof Omit<TTaskContext, "initial">,
> {
  private readonly _tasks = new Map<string, Task<TTaskDependencies, TTaskContext, unknown, TAllDependencyIds>>();
  private readonly _topologicalOrder: string[] = [];

  constructor(
    private _dependencies: TTaskDependencies,
    private _contextValueOrFactory: undefined | TTaskContext | (() => TTaskContext | Promise<TTaskContext>),
  ) {}

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
  public addTask<TTaskId extends string, TTaskDependencyIds extends TAllDependencyIds, TTaskReturn>(
    options: TaskOptions<TTaskId, TTaskDependencies, TTaskContext, TTaskReturn, TTaskDependencyIds>,
  ) {
    const taskId = options.id;
    if (this._tasks.has(taskId)) throw new Error(`Task with id ${taskId} already exists`);
    const task = new Task<TTaskDependencies, TTaskContext, TTaskReturn, TAllDependencyIds>(options);
    this._tasks.set(taskId, task);

    for (const depId of options.dependencies ?? []) {
      if (typeof depId !== "string") throw new Error("Dependency ID must be a string");
      const dependentTask = this._tasks.get(depId);
      if (!dependentTask) throw new Error(`Dependency ${depId} not found for task ${taskId}`);
      task.addDependency(depId);
    }

    return this as unknown as TaskGraphBuilder<
      TTaskDependencies,
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
  public build() {
    if (!this.size) throw new Error("Unable to build TaskGraphRunner. No tasks added to the graph");
    this._topologicalSort();
    return new TaskGraphRunner(this._dependencies, this._contextValueOrFactory, this._topologicalOrder, this._tasks);
  }

  /**
   * Returns the number of tasks in the graph.
   */
  public get size() {
    return this._tasks.size;
  }

  /**
   * Topologically sorts the tasks in the graph, placing the sorted order in the `_topologicalOrder` array.
   */
  private _topologicalSort() {
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = (taskId: string) => {
      if (temp.has(taskId)) throw new Error(`Circular dependency detected involving task ${taskId}`);
      if (!visited.has(taskId)) {
        temp.add(taskId);
        const task = this._tasks.get(taskId);
        if (!task) throw new Error(`Task ${taskId} not found`);
        for (const depId of task.dependencies) visit(depId);
        temp.delete(taskId);
        visited.add(taskId);
        this._topologicalOrder.push(taskId);
      }
    };

    for (const taskId of this._tasks.keys()) if (!visited.has(taskId)) visit(taskId);
    visited.clear();
    temp.clear();
  }
}

export class TaskGraphRunner<
  TTaskDependencies extends Record<string, unknown>,
  TTaskContext extends Record<string, unknown> & { initial: unknown },
> {
  private readonly context = new Context<TTaskContext["initial"], TTaskContext>();

  constructor(
    private _dependencies: TTaskDependencies,
    private _contextValueOrFactory: undefined | TTaskContext | (() => TTaskContext | Promise<TTaskContext>),
    private readonly _topologicalOrder: string[],
    private readonly _tasks: Map<string, Task<TTaskDependencies, TTaskContext, unknown, string>>,
  ) {}

  /**
   * Runs the tasks in the graph in topological order.
   * Tasks are run concurrently when possible.
   * In the event a task fails, other independent tasks will continue to run.
   *
   * @returns A promise that resolves to the completed context object when all tasks have completed.
   */
  async run(): Promise<TTaskContext> {
    if (this._topologicalOrder.length === 0)
      throw new Error("No tasks to run. Did you forget to call topologicalSort?");

    let value: TTaskContext["initial"] | undefined;
    if (this._contextValueOrFactory) {
      value =
        typeof this._contextValueOrFactory === "function"
          ? await (this._contextValueOrFactory as () => TTaskContext["initial"] | Promise<TTaskContext["initial"]>)()
          : this._contextValueOrFactory;
    }
    this.context.reset(value);

    const completed = new Set<string>();
    const running = new Map<string, Promise<void>>();
    const readyTasks = new Set<string>(
      this._topologicalOrder.filter((taskId) => this._tasks.get(taskId)?.dependencies.length === 0),
    );

    const runTask = async (taskId: string) => {
      const task = this._tasks.get(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);

      try {
        const result = await task.run(this._dependencies, this.context.value);
        await this.context.update({ [taskId]: result });
        completed.add(taskId);
      } catch {
        // completed in the sense that we won't try to run it again
        completed.add(taskId);
      } finally {
        running.delete(taskId);

        // Check if any dependent tasks are now ready to run
        for (const [id, t] of this._tasks) {
          if (!completed.has(id) && !running.has(id)) {
            const canRun = t.dependencies.every((depId) => {
              const depTask = this._tasks.get(depId);
              return depTask && completed.has(depId) && depTask.status === "completed";
            });
            if (canRun) readyTasks.add(id);
          }
        }
      }
    };

    while (completed.size < this._tasks.size) {
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

    return this.context.value;
  }
}

class Task<
  TTaskDependencies extends Record<string, unknown>,
  TTaskContext extends Record<string, unknown> & { initial: unknown },
  TTaskReturn,
  TPossibleTaskId,
> {
  private readonly _dependencies: TPossibleTaskId[] = [];

  private _retryPolicy: RetryPolicy = { maxRetries: 0, retryDelayMs: 0 };
  private _status: TaskStatus = "pending";

  constructor(private readonly options: TaskOptions<string, TTaskDependencies, TTaskContext, TTaskReturn, string>) {
    if (options.retryPolicy) this._retryPolicy = options.retryPolicy;
  }

  public addDependency(taskId: TPossibleTaskId) {
    this._dependencies.push(taskId);
  }

  public get dependencies() {
    return this._dependencies;
  }

  public get id() {
    return this.options.id;
  }

  public async run(deps: TTaskDependencies, ctx: TTaskContext): Promise<TTaskReturn> {
    // we retry maxRetries times on top of the initial attempt
    for (let attempt = 0; attempt < this._retryPolicy.maxRetries + 1; attempt++) {
      try {
        this._status = "running";
        const result = await this.options.execute({ deps, ctx });
        this._status = "completed";
        return result;
      } catch (err) {
        if (attempt === this._retryPolicy.maxRetries) {
          console.error(`Task failed after ${attempt + 1} attempts: ${err}`);
          const error = err instanceof Error ? err : new Error(`Non error throw: ${String(err)}`);
          try {
            if (this.options.errorHandler) await this.options.errorHandler(error, { deps, ctx });
            else console.error(`Error in task ${this.options.id}: ${err}`);
          } catch (error) {
            console.error(`Error in task error handler for ${this.options.id}: ${error}`);
          }
          this._status = "failed";
          throw error;
        }
        console.error(`Task failed, retrying (attempt ${attempt + 1}/${this._retryPolicy.maxRetries}): ${err}`);
        await sleep(this._retryPolicy.retryDelayMs);
      }
    }

    // This line should never be reached due to the for loop condition,
    // but TypeScript requires a return statement here
    throw new Error("Unexpected end of run method");
  }

  public get status() {
    return this._status;
  }
}

type RetryPolicy = {
  maxRetries: number;
  retryDelayMs: number;
};

type TaskOptions<
  TTaskId extends string,
  TTaskDependencies extends Record<string, unknown>,
  TTaskContext extends Record<string, unknown> & { initial: unknown },
  TTaskReturn,
  TPossibleTaskDependencyId extends string = never,
  TInput = { deps: TTaskDependencies; ctx: TTaskContext },
> = {
  id: TTaskId;
  dependencies?: TPossibleTaskDependencyId[];
  retryPolicy?: RetryPolicy;
  execute: (input: TInput) => Promise<TTaskReturn> | TTaskReturn;
  errorHandler?: (err: Error, input: TInput) => Promise<void> | void;
};

type TaskStatus = "pending" | "completed" | "failed" | "running";
