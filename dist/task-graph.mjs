// src/_context.ts
var Context = class {
  object;
  updateQueue;
  constructor(initialValue) {
    this.reset(initialValue);
    this.updateQueue = Promise.resolve();
  }
  /**
   * Gets the current state of the managed object.
   */
  get value() {
    return this.object;
  }
  /**
   * Resets the context to its initial state or a new initial object.
   */
  reset(initialValue) {
    if (initialValue !== void 0 && initialValue !== null) {
      this.object = { initial: initialValue };
    } else {
      this.object = { initial: void 0 };
    }
  }
  /**
   * Asynchronously updates the context with new values. Ensures that updates are applied in the order they are called.
   */
  update(updateValue) {
    this.updateQueue = this.updateQueue.then(() => {
      this.object = { ...this.object, ...updateValue };
      return Promise.resolve();
    });
    return this.updateQueue;
  }
};

// src/_task.ts
import { promisify } from "node:util";
var Task = class {
  constructor(options) {
    this.options = options;
    if (options.retryPolicy) {
      this._validateRetryPolicy(options.retryPolicy);
      this._retryPolicy = options.retryPolicy;
    }
  }
  _dependencies = [];
  _retryPolicy = { maxRetries: 0, retryDelayMs: 0 };
  _status = "pending";
  /**
   * Adds a dependency to the task.
   *
   * @param taskId - The ID of the task to add as a dependency
   */
  addDependency(taskId) {
    if (taskId === this.options.id) {
      throw new Error("A task cannot depend on itself");
    }
    this._dependencies.push(taskId);
  }
  /**
   * Gets the list of task dependencies.
   *
   * @returns An array of task IDs representing the dependencies
   */
  get dependencies() {
    return this._dependencies;
  }
  /**
   * Gets the ID of the task.
   *
   * @returns The task ID
   */
  get id() {
    return this.options.id;
  }
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
  async run(deps, ctx) {
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
            if (this.options.errorHandler) {
              await this.options.errorHandler(error, { deps, ctx });
            } else {
              console.error(`Error in task ${this.options.id}: ${err}`);
            }
          } catch (error2) {
            console.error(`Error in task error handler for ${this.options.id}: ${error2}`);
          }
          this._status = "failed";
          throw error;
        }
        console.error(`Task failed, retrying (attempt ${attempt + 1}/${this._retryPolicy.maxRetries}): ${err}`);
        await sleep(this._retryPolicy.retryDelayMs);
      }
    }
    throw new Error("Unexpected end of run method");
  }
  /**
   * Gets the status of the task.
   *
   * @returns The current status of the task
   */
  get status() {
    return this._status;
  }
  _validateRetryPolicy(retryPolicy) {
    const { maxRetries, retryDelayMs } = retryPolicy;
    if (typeof maxRetries !== "number" || maxRetries < 0 || !Number.isInteger(maxRetries)) {
      throw new Error("maxRetries must be a non-negative integer");
    }
    if (typeof retryDelayMs !== "number" || retryDelayMs < 0) {
      throw new Error("retryDelayMs must be a non-negative number");
    }
  }
};
var sleep = promisify(setTimeout);

// src/task-graph.ts
var TaskGraph = class {
  // start with an undefined context value (placed under key initial)
  _contextValueOrFactory = void 0;
  // start with an empty dependencies object
  _dependencies = /* @__PURE__ */ Object.create(null);
  /**
   * Finalizes the setup and returns an instance of `TaskGraphBuilder`.
   * Once invoked, the initial context and dependencies are no longer mutable.
   *
   * @returns A new instance of `TaskGraphBuilder` with the current state.
   */
  finalize() {
    return new TaskGraphBuilder(
      this._dependencies,
      this._contextValueOrFactory
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
  setContext(valueOrFactory) {
    this._contextValueOrFactory = valueOrFactory;
    return this;
  }
  /**
   * Sets the dependencies for the task graph. These dependencies will be available to all tasks in the graph.
   * Multiple invocation of this method will override the previous dependencies.
   *
   * @template TNewDependencies The type of the new dependencies, which must be an object.
   * @param value - The dependencies object to be used across all tasks in the graph.
   * @returns A TaskGraph instance with the new dependencies type.
   */
  setDependencies(value) {
    if (typeof value !== "object" || value === null) {
      throw new Error("Initial dependencies must be an object");
    }
    this._dependencies = value;
    return this;
  }
};
var TaskGraphBuilder = class {
  constructor(_dependencies, _contextValueOrFactory) {
    this._dependencies = _dependencies;
    this._contextValueOrFactory = _contextValueOrFactory;
  }
  _tasks = /* @__PURE__ */ new Map();
  _topologicalOrder = [];
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
  addTask(options) {
    const taskId = options.id;
    if (this._tasks.has(taskId)) {
      throw new Error(`Task with id ${taskId} already exists`);
    }
    const task = new Task(options);
    this._tasks.set(taskId, task);
    for (const depId of options.dependencies ?? []) {
      if (typeof depId !== "string") {
        throw new Error("Dependency ID must be a string");
      }
      const dependentTask = this._tasks.get(depId);
      if (!dependentTask) {
        throw new Error(`Dependency ${depId} not found for task ${taskId}`);
      }
      task.addDependency(depId);
    }
    return this;
  }
  /**
   * Builds and returns a TaskGraphRunner instance.
   * This method finalizes the task graph and prepares it for execution by topologically sorting the tasks.
   *
   * @returns A new `TaskGraphRunner` instance ready to execute the task graph.
   *
   * @throws {Error} If no tasks have been added to the graph.
   */
  build() {
    if (!this.size) {
      throw new Error("Unable to build TaskGraphRunner. No tasks added to the graph");
    }
    this._topologicalSort();
    return new TaskGraphRunner(this._dependencies, this._contextValueOrFactory, this._topologicalOrder, this._tasks);
  }
  /**
   * Returns the number of tasks in the graph.
   */
  get size() {
    return this._tasks.size;
  }
  /**
   * Topologically sorts the tasks in the graph, placing the sorted order in the `_topologicalOrder` array.
   */
  _topologicalSort() {
    const visited = /* @__PURE__ */ new Set();
    const temp = /* @__PURE__ */ new Set();
    const visit = (taskId) => {
      if (temp.has(taskId)) {
        throw new Error(`Circular dependency detected involving task ${taskId}`);
      }
      if (!visited.has(taskId)) {
        temp.add(taskId);
        const task = this._tasks.get(taskId);
        if (!task) {
          throw new Error(`Task ${taskId} not found`);
        }
        for (const depId of task.dependencies) {
          visit(depId);
        }
        temp.delete(taskId);
        visited.add(taskId);
        this._topologicalOrder.push(taskId);
      }
    };
    for (const taskId of this._tasks.keys()) {
      if (!visited.has(taskId)) {
        visit(taskId);
      }
    }
    visited.clear();
    temp.clear();
  }
};
var TaskGraphRunner = class {
  constructor(_dependencies, _contextValueOrFactory, _topologicalOrder, _tasks) {
    this._dependencies = _dependencies;
    this._contextValueOrFactory = _contextValueOrFactory;
    this._topologicalOrder = _topologicalOrder;
    this._tasks = _tasks;
  }
  context = new Context();
  /**
   * Runs the tasks in the graph in topological order.
   * Tasks are run concurrently when possible.
   * In the event a task fails, other independent tasks will continue to run.
   *
   * @returns A promise that resolves to the completed context object when all tasks have completed.
   */
  async run() {
    if (this._topologicalOrder.length === 0) {
      throw new Error("No tasks to run. Did you forget to call topologicalSort?");
    }
    let value;
    if (this._contextValueOrFactory) {
      value = typeof this._contextValueOrFactory === "function" ? await this._contextValueOrFactory() : this._contextValueOrFactory;
    }
    this.context.reset(value);
    const completed = /* @__PURE__ */ new Set();
    const running = /* @__PURE__ */ new Map();
    const readyTasks = new Set(
      this._topologicalOrder.filter((taskId) => {
        const task = this._tasks.get(taskId);
        if (!task) {
          throw new Error(`Task ${taskId} not found`);
        }
        return task.dependencies.length === 0;
      })
    );
    const runTask = async (taskId) => {
      const task = this._tasks.get(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }
      try {
        const result = await task.run(this._dependencies, this.context.value);
        await this.context.update({ [taskId]: result });
        completed.add(taskId);
      } catch {
        completed.add(taskId);
      } finally {
        running.delete(taskId);
        for (const [id, t] of this._tasks) {
          if (!completed.has(id) && !running.has(id)) {
            const canRun = t.dependencies.every((depId) => {
              const depTask = this._tasks.get(depId);
              return depTask && completed.has(depId) && depTask.status === "completed";
            });
            if (canRun) {
              readyTasks.add(id);
            }
          }
        }
      }
    };
    while (completed.size < this._tasks.size) {
      for (const taskId of readyTasks) {
        readyTasks.delete(taskId);
        const promise = runTask(taskId);
        running.set(taskId, promise);
      }
      if (running.size > 0) {
        await Promise.race(running.values());
      } else {
        break;
      }
    }
    return this.context.value;
  }
};
export {
  TaskGraph,
  TaskGraphBuilder,
  TaskGraphRunner
};
//# sourceMappingURL=task-graph.mjs.map