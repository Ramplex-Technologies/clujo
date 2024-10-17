"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/task-graph.ts
var task_graph_exports = {};
__export(task_graph_exports, {
  TaskGraph: () => TaskGraph,
  TaskGraphRunner: () => TaskGraphRunner
});
module.exports = __toCommonJS(task_graph_exports);
var import_node_util = require("util");

// src/context.ts
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

// src/task-graph.ts
var sleep = (0, import_node_util.promisify)(setTimeout);
var TaskGraph = class {
  // start with an undefined context value (placed under key initial)
  _contextValueOrFactory = void 0;
  // start with an empty dependencies object
  _dependencies = /* @__PURE__ */ Object.create(null);
  finalize() {
    return new TaskGraphBuilder(
      this._dependencies,
      this._contextValueOrFactory
    );
  }
  setContext(valueOrFactory) {
    this._contextValueOrFactory = valueOrFactory;
    return this;
  }
  setDependencies(value) {
    if (typeof value !== "object" || value === null) throw new Error("Initial dependencies must be an object");
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
  addTask(options) {
    const taskId = options.id;
    if (this._tasks.has(taskId)) throw new Error(`Task with id ${taskId} already exists`);
    const task = new Task(options);
    this._tasks.set(taskId, task);
    for (const depId of options.dependencies ?? []) {
      if (typeof depId !== "string") throw new Error("Dependency ID must be a string");
      const dependentTask = this._tasks.get(depId);
      if (!dependentTask) throw new Error(`Dependency ${depId} not found for task ${taskId}`);
      task.addDependency(depId);
    }
    return this;
  }
  build() {
    if (!this.size) throw new Error("Unable to build TaskGraphRunner. No tasks added to the graph");
    this._topologicalSort();
    return new TaskGraphRunner(this._dependencies, this._contextValueOrFactory, this._topologicalOrder, this._tasks);
  }
  get size() {
    return this._tasks.size;
  }
  _topologicalSort() {
    const visited = /* @__PURE__ */ new Set();
    const temp = /* @__PURE__ */ new Set();
    const visit = (taskId) => {
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
};
var TaskGraphRunner = class {
  constructor(_dependencies, _contextValueOrFactory, _topologicalOrder, _tasks) {
    this._dependencies = _dependencies;
    this._contextValueOrFactory = _contextValueOrFactory;
    this._topologicalOrder = _topologicalOrder;
    this._tasks = _tasks;
  }
  context = new Context();
  run = async () => {
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
      this._topologicalOrder.filter((taskId) => this._tasks.get(taskId)?.dependencies.length === 0)
    );
    const runTask = async (taskId) => {
      const task = this._tasks.get(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
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
            if (canRun) readyTasks.add(id);
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
  };
};
var Task = class {
  constructor(options) {
    this.options = options;
    if (options.retryPolicy) this._retryPolicy = options.retryPolicy;
  }
  _dependencies = [];
  _retryPolicy = { maxRetries: 0, retryDelayMs: 0 };
  _status = "pending";
  addDependency(taskId) {
    this._dependencies.push(taskId);
  }
  get dependencies() {
    return this._dependencies;
  }
  get id() {
    return this.options.id;
  }
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
  get status() {
    return this._status;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TaskGraph,
  TaskGraphRunner
});
//# sourceMappingURL=task-graph.cjs.map