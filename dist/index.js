"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  ClujoBuilder: () => ClujoBuilder,
  Scheduler: () => Scheduler,
  TaskGraphBuilder: () => TaskGraphBuilder
});
module.exports = __toCommonJS(src_exports);

// src/clujo.ts
var import_redis_semaphore = require("redis-semaphore");

// src/task-graph-builder.ts
var import_node_util = require("util");

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
var sleep = (0, import_node_util.promisify)(setTimeout);
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

// src/clujo.ts
var Clujo = class {
  constructor(id, cron, retryPolicy, runImmediately, dependencies, contextValueOrFactory) {
    this.id = id;
    this.cron = cron;
    this.retryPolicy = retryPolicy;
    this.runImmediately = runImmediately;
    this.hasStarted = false;
    this.taskGraphBuilder = new TaskGraphBuilder().setDependencies(dependencies).setInitialContext(contextValueOrFactory).finalizeSetup();
  }
  addTask(input) {
    if (this.hasStarted) throw new Error("Cannot add a task after the Clujo has started.");
    this.taskGraphBuilder.addTask({
      id: input.taskId,
      execute: input.execute,
      errorHandler: input.errorHandler,
      retryPolicy: input.retryPolicy ?? this.retryPolicy,
      dependencies: input.dependencies
    });
    return this;
  }
  start(options) {
    if (this.hasStarted) throw new Error("Cannot start a Clujo that has already been started.");
    if (!this.taskGraphBuilder.size) throw new Error("Cannot start a Clujo with no added tasks.");
    this.taskGraph = this.taskGraphBuilder.build();
    const redis = options?.redis;
    const executeTasksAndCompletionHandler = async () => {
      if (!this.taskGraph) throw new Error("Task graph not initialized");
      const finalContext = await this.taskGraph.run();
      if (options?.completionHandler) await options.completionHandler(finalContext);
    };
    const handler = async () => {
      try {
        if (!redis) {
          await executeTasksAndCompletionHandler();
        } else {
          await using lock = await this.tryAcquire(redis, options?.options);
          if (lock) {
            await executeTasksAndCompletionHandler();
          }
        }
      } catch (error) {
        console.error(`Clujo ${this.id} failed: ${error}`);
      }
    };
    this.cron.start(handler);
    this.hasStarted = true;
    if (this.runImmediately) this.trigger();
    return this;
  }
  async stop(timeout = 5e3) {
    if (!this.hasStarted) throw new Error("Cannot stop a Clujo that has not been started.");
    await this.cron.stop(timeout);
  }
  async trigger() {
    if (!this.taskGraphBuilder.size) throw new Error("Cannot trigger a Clujo with no added tasks.");
    if (!this.taskGraph) this.taskGraph = this.taskGraphBuilder.build();
    return await this.taskGraph.run();
  }
  async tryAcquire(redis, lockOptions) {
    const mutex = new import_redis_semaphore.Mutex(redis, this.id, lockOptions);
    const lock = await mutex.tryAcquire();
    if (!lock) return null;
    return {
      mutex,
      [Symbol.asyncDispose]: async () => {
        try {
          await mutex.release();
        } catch (error) {
          console.error(`Error releasing lock for Clujo ${this.id}: ${error}`);
        }
      }
    };
  }
};

// src/cron.ts
var import_croner = __toESM(require("croner"));
var Cron = class {
  constructor(cronExpression, cronOptions) {
    this.cronExpression = cronExpression;
    this.cronOptions = cronOptions;
    this.job = null;
  }
  start(handler) {
    if (this.job) throw new Error("Attempting to start an already started job");
    this.job = new import_croner.default(this.cronExpression, this.cronOptions, handler);
  }
  stop(timeout) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const checkAndStop = () => {
        if (!this.job) {
          resolve();
          return;
        }
        if (this.job.isBusy()) {
          if (Date.now() - startTime > timeout) {
            this.job.stop();
            this.job = null;
            resolve();
            return;
          }
          setTimeout(checkAndStop, 100);
        } else {
          this.job.stop();
          this.job = null;
          resolve();
        }
      };
      checkAndStop();
    });
  }
};

// src/clujo-builder.ts
var ClujoBuilder = class {
  constructor(id) {
    this.id = id;
  }
  setSchedule(pattern, options) {
    const cron = new Cron(pattern, options);
    return new ClujoBuilderHelper(this.id, cron);
  }
};
var ClujoBuilderHelper = class {
  constructor(id, cron) {
    this.id = id;
    this.cron = cron;
    // do not retry by default
    this.retryPolicy = { maxRetries: 0, retryDelayMs: 0 };
    // do not run immediately by default
    this.runImmediately = false;
    // do not set initial context by default
    this.contextValueOrFactory = void 0;
  }
  // biome-ignore lint/complexity/noBannedTypes: valid use case here
  build() {
    return new Clujo(
      this.id,
      this.cron,
      this.retryPolicy,
      this.runImmediately,
      this.dependencies,
      this.contextValueOrFactory
    );
  }
  runOnStartup() {
    this.runImmediately = true;
    return this;
  }
  setDependencies(deps) {
    this.dependencies = deps;
    return this;
  }
  setInitialContext(valueOrFactory) {
    this.contextValueOrFactory = valueOrFactory;
    return this;
  }
  setRetryPolicy(policy) {
    this.retryPolicy = policy;
    return this;
  }
};

// src/scheduler.ts
var Scheduler = class {
  constructor() {
    // biome-ignore lint/suspicious/noExplicitAny: handle any combination of clujo's
    this.jobs = [];
  }
  /**
   * Adds a Clujo job to the scheduler.
   * @param input - Object containing the job and optional completion handler.
   * @param input.job - The Clujo job to be added.
   * @param input.completionHandler - Optional function to invoke after the job completes.
   */
  addJob(input) {
    this.jobs.push(input);
  }
  /**
   * Starts all added jobs in the scheduler.
   * @param redis - Optional Redis instance to be passed to the jobs. If provided, enables distributed locking.
   */
  start(redis) {
    for (const { job, completionHandler } of this.jobs) {
      job.start({ redis, completionHandler });
    }
  }
  /**
   * Stops all running jobs in the scheduler.
   * @param timeout - The maximum time (in milliseconds) to wait for jobs to stop.
   * @returns A promise that resolves when all jobs have stopped or the timeout is reached.
   */
  async stop(timeout) {
    await Promise.all(this.jobs.map(({ job }) => job.stop(timeout)));
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ClujoBuilder,
  Scheduler,
  TaskGraphBuilder
});
//# sourceMappingURL=index.js.map