// src/task-graph-builder.ts
import { promisify } from "node:util";

// src/context.ts
var Context = class {
  constructor(initialObject) {
    this.reset(initialObject);
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
  reset(initialObject) {
    if (initialObject) {
      this.object = { initial: { ...initialObject } };
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

// src/task-graph.ts
var TaskGraph = class {
  constructor(taskDependencies, contextValueOrFactory, tasks, order) {
    this.taskDependencies = taskDependencies;
    this.contextValueOrFactory = contextValueOrFactory;
    this.tasks = tasks;
    this.order = order;
    this.context = new Context();
    this.run = async () => {
      if (this.order.length === 0) throw new Error("No tasks to run. Did you forget to call topologicalSort?");
      let value;
      if (this.contextValueOrFactory) {
        value = typeof this.contextValueOrFactory === "function" ? await this.contextValueOrFactory() : this.contextValueOrFactory;
      }
      this.context.reset(value);
      const completed = /* @__PURE__ */ new Set();
      const running = /* @__PURE__ */ new Map();
      const readyTasks = new Set(
        this.order.filter((taskId) => this.tasks.get(taskId)?.dependencies.length === 0)
      );
      const runTask = async (taskId) => {
        const task = this.tasks.get(taskId);
        if (!task) throw new Error(`Task ${taskId} not found`);
        try {
          const result = await task.run(this.taskDependencies, this.context.value);
          await this.context.update({ [taskId]: result });
          completed.add(taskId);
        } catch {
          completed.add(taskId);
        } finally {
          running.delete(taskId);
          for (const [id, t] of this.tasks) {
            if (!completed.has(id) && !running.has(id)) {
              const canRun = t.dependencies.every((depId) => {
                const depTask = this.tasks.get(depId);
                return depTask && completed.has(depId) && depTask.status === "completed";
              });
              if (canRun) readyTasks.add(id);
            }
          }
        }
      };
      while (completed.size < this.tasks.size) {
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
    };
  }
};

// src/task-graph-builder.ts
var sleep = promisify(setTimeout);
var Task = class {
  constructor(options) {
    this.options = options;
    this._dependencies = [];
    this._retryPolicy = { maxRetries: 0, retryDelayMs: 0 };
    this._status = "pending";
    if (options.retryPolicy) this._retryPolicy = options.retryPolicy;
  }
  get id() {
    return this.options.id;
  }
  get status() {
    return this._status;
  }
  get dependencies() {
    return this._dependencies;
  }
  addDependency(taskId) {
    this._dependencies.push(taskId);
  }
  async run(deps, ctx) {
    for (let attempt = 0; attempt < this._retryPolicy.maxRetries + 1; attempt++) {
      try {
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
};
var TaskGraphBuilder = class {
  constructor() {
    this.contextValueOrFactory = void 0;
  }
  finalizeSetup() {
    return new TaskGraphBuilderHelper(
      this.dependencies,
      this.contextValueOrFactory
    );
  }
  setDependencies(value) {
    this.dependencies = value;
    return this;
  }
  setInitialContext(valueOrFactory) {
    this.contextValueOrFactory = valueOrFactory;
    return this;
  }
};
var TaskGraphBuilderHelper = class {
  constructor(dependencies, contextValueOrFactory) {
    this.dependencies = dependencies;
    this.contextValueOrFactory = contextValueOrFactory;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    this.tasks = /* @__PURE__ */ new Map();
    this.order = [];
  }
  get size() {
    return this.tasks.size;
  }
  build() {
    this.topologicalSort();
    return new TaskGraph(this.dependencies, this.contextValueOrFactory, this.tasks, this.order);
  }
  addTask(options) {
    const taskId = options.id;
    if (this.tasks.has(taskId)) {
      throw new Error(`Task with id ${taskId} already exists`);
    }
    const task = new Task(options);
    this.tasks.set(taskId, task);
    for (const depId of options.dependencies ?? []) {
      if (typeof depId !== "string") throw new Error("Dependency ID must be a string");
      const dependentTask = this.tasks.get(depId);
      if (!dependentTask) throw new Error(`Dependency ${depId} not found for task ${taskId}`);
      task.addDependency(depId);
    }
    return this;
  }
  topologicalSort() {
    const visited = /* @__PURE__ */ new Set();
    const temp = /* @__PURE__ */ new Set();
    const visit = (taskId) => {
      if (temp.has(taskId)) {
        throw new Error(`Circular dependency detected involving task ${taskId}`);
      }
      if (!visited.has(taskId)) {
        temp.add(taskId);
        const task = this.tasks.get(taskId);
        if (!task) throw new Error(`Task ${taskId} not found`);
        for (const depId of task.dependencies) {
          visit(depId);
        }
        temp.delete(taskId);
        visited.add(taskId);
        this.order.push(taskId);
      }
    };
    for (const taskId of this.tasks.keys()) {
      if (!visited.has(taskId)) {
        visit(taskId);
      }
    }
  }
};
export {
  TaskGraphBuilder,
  TaskGraphBuilderHelper
};
//# sourceMappingURL=task-graph-builder.mjs.map