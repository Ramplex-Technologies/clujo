"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
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
var __using = (stack, value, async) => {
  if (value != null) {
    if (typeof value !== "object" && typeof value !== "function") __typeError("Object expected");
    var dispose, inner;
    if (async) dispose = value[__knownSymbol("asyncDispose")];
    if (dispose === void 0) {
      dispose = value[__knownSymbol("dispose")];
      if (async) inner = dispose;
    }
    if (typeof dispose !== "function") __typeError("Object not disposable");
    if (inner) dispose = function() {
      try {
        inner.call(this);
      } catch (e) {
        return Promise.reject(e);
      }
    };
    stack.push([async, dispose, value]);
  } else if (async) {
    stack.push([async]);
  }
  return value;
};
var __callDispose = (stack, error, hasError) => {
  var E = typeof SuppressedError === "function" ? SuppressedError : function(e, s, m, _) {
    return _ = Error(m), _.name = "SuppressedError", _.error = e, _.suppressed = s, _;
  };
  var fail = (e) => error = hasError ? new E(e, error, "An error was suppressed during disposal") : (hasError = true, e);
  var next = (it) => {
    while (it = stack.pop()) {
      try {
        var result = it[1] && it[1].call(it[2]);
        if (it[0]) return Promise.resolve(result).then(next, (e) => (fail(e), next()));
      } catch (e) {
        fail(e);
      }
    }
    if (hasError) throw error;
  };
  return next();
};

// src/index.ts
var src_exports = {};
__export(src_exports, {
  Clujo: () => Clujo,
  Scheduler: () => Scheduler,
  TaskGraph: () => TaskGraph
});
module.exports = __toCommonJS(src_exports);

// src/clujo.ts
var import_redis_semaphore = require("redis-semaphore");

// src/cron.ts
var import_croner = require("croner");
var Cron = class {
  constructor(cronExpression, cronOptions) {
    this.cronExpression = cronExpression;
    this.cronOptions = cronOptions;
  }
  job = null;
  /**
   * Starts the cron job with the specified handler.
   *
   * @param handler A function to be executed when the cron job triggers.
   * @throws {Error} If attempting to start a job that has already been started.
   */
  start(handler) {
    if (this.job) throw new Error("Attempting to start an already started job");
    this.job = new import_croner.Cron(this.cronExpression, this.cronOptions, handler);
  }
  /**
   * Stops the cron job. If the job is currently running, it will wait for the job to finish before stopping it.
   * This can be safely invoked even if the job hasn't been started.
   *
   * @param timeout The maximum time (in ms) to wait for the job to finish before stopping it forcefully.
   * @returns A promise that resolves when the job has been stopped
   */
  stop(timeout) {
    if (!this.job) return Promise.resolve();
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
          return;
        }
      };
      checkAndStop();
    });
  }
  /**
   * Triggers the cron job to run immediately. A triggered execution will prevent the job from running at its scheduled time
   * unless `preventOverlap` is set to `false` in the cron options.
   *
   * @throws {Error} If attempting to trigger a job that is not running.
   */
  async trigger() {
    if (!this.job) throw new Error("Attempting to trigger a job that is not running");
    await this.job.trigger();
  }
};

// src/clujo.ts
var Clujo = class {
  id;
  _cron;
  _taskGraphRunner;
  _hasStarted = false;
  constructor({
    id,
    taskGraphRunner,
    cron
  }) {
    if (!id) throw new Error("Clujo ID is required.");
    if (!taskGraphRunner) throw new Error("taskGraphRunner is required");
    if (!cron.pattern) throw new Error("cron.pattern is required");
    this.id = id;
    this._taskGraphRunner = taskGraphRunner;
    this._cron = new Cron(cron.pattern, cron.options);
  }
  /**
   * Starts the cron job, which will execute the task graph according to the cron schedule.
   * If a redis client instance is provided, a lock will be acquired before executing the task graph, preventing overlapping executions.
   *
   * @param redis The Redis client to use for locking.
   * @param onTaskCompletion An optional function to execute after the task graph has completed.
   * @param runImmediately An optional boolean which, if set to true, executes the task graph immediately upon starting.
   *    The overlap behavior here depends on if a lock is used (never any overlap), or if `preventOverlap` was disabled (
   *    in which case there is overlap between multiple instances of the same Clujo).
   * @returns The Clujo instance.
   * @throws An error if the Clujo has already started.
   */
  start({
    redis,
    onTaskCompletion,
    runImmediately
  } = {
    redis: void 0,
    onTaskCompletion: void 0,
    runImmediately: false
  }) {
    if (this._hasStarted) throw new Error("Cannot start a Clujo that has already started.");
    if (redis) {
      if (!redis.client) throw new Error("Redis client is required.");
    }
    if (onTaskCompletion && typeof onTaskCompletion !== "function") {
      throw new Error("onTaskCompletion must be a function (sync or async).");
    }
    if (runImmediately && typeof runImmediately !== "boolean") {
      throw new Error("runImmediately must be a boolean.");
    }
    const executeTasksAndCompletionHandler = async () => {
      const finalContext = await this._taskGraphRunner.run();
      if (onTaskCompletion) await onTaskCompletion(finalContext);
    };
    const handler = async () => {
      try {
        if (!redis) await executeTasksAndCompletionHandler();
        else {
          var _stack = [];
          try {
            const lock = __using(_stack, await this._tryAcquire(redis.client, redis.lockOptions), true);
            if (lock) await executeTasksAndCompletionHandler();
          } catch (_) {
            var _error = _, _hasError = true;
          } finally {
            var _promise = __callDispose(_stack, _error, _hasError);
            _promise && await _promise;
          }
        }
      } catch (error) {
        console.error(`Clujo ${this.id} failed: ${error}`);
      }
    };
    this._cron.start(handler);
    this._hasStarted = true;
    if (runImmediately) this._cron.trigger();
    return this;
  }
  /**
   * Stops the cron job and prevents any further executions of the task graph.
   * If the task graph is currently executing, it will be allowed to finish for up to the specified timeout.
   *
   * @param timeout The maximum time to wait for the task graph to finish executing before stopping the cron.
   * @returns A promise that resolves when the cron has stopped.
   * @throws An error if the Clujo has not started.
   */
  async stop(timeout = 5e3) {
    if (!this._hasStarted) throw new Error("Cannot stop a Clujo that has not started.");
    await this._cron.stop(timeout);
  }
  /**
   * Trigger an execution of the task graph immediately, independent of the cron schedule.
   * In the event the cron is running, the task graph will still execute.
   *
   * @returns The final context of the task graph.
   */
  async trigger() {
    return await this._taskGraphRunner.run();
  }
  /**
   * Tries to acquire a lock from redis-semaphore. If the lock is acquired, the lock will be released when the lock is disposed.
   *
   * @param redis The Redis client to use.
   * @param lockOptions The options to use when acquiring the lock.
   *
   * @returns An AsyncDisposable lock if it was acquired, otherwise null.
   */
  async _tryAcquire(redis, lockOptions) {
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

// src/scheduler.ts
var Scheduler = class {
  // biome-ignore lint/suspicious/noExplicitAny: handle any combination of clujo's
  jobs = [];
  /**
   * Adds a Clujo job to the scheduler.
   * @param input - Object containing the job and optional completion handler.
   * @param input.job - The Clujo job to be added.
   * @param input.completionHandler - Optional function to invoke after the job completes.
   */
  addJob(input) {
    if (this.jobs.some(({ job }) => job.id === input.job.id)) {
      throw new Error(`Job with id ${input.job.id} is already added to the scheduler.`);
    }
    this.jobs.push(input);
  }
  /**
   * Starts all added jobs in the scheduler.
   *
   * @param redis - Optional Redis instance to be passed to the jobs. If provided, enables distributed locking.
   */
  start(redis) {
    for (const { job, completionHandler } of this.jobs) {
      const options = {};
      if (redis) {
        options.redis = { client: redis };
      }
      if (completionHandler) {
        options.onTaskCompletion = completionHandler;
      }
      job.start(options);
    }
  }
  /**
   * Stops all running jobs in the scheduler.
   *
   * @param timeout - The maximum time (in milliseconds) to wait for jobs to stop. Defaults to 5000ms.
   * @returns A promise that resolves when all jobs have stopped or the timeout is reached.
   */
  async stop(timeout = 5e3) {
    await Promise.all(this.jobs.map(({ job }) => job.stop(timeout)));
  }
};

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

// src/task.ts
var import_node_util = require("util");
var sleep = (0, import_node_util.promisify)(setTimeout);
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
  /**
   * Builds and returns a TaskGraphRunner instance.
   * This method finalizes the task graph and prepares it for execution by topologically sorting the tasks.
   *
   * @returns A new `TaskGraphRunner` instance ready to execute the task graph.
   *
   * @throws {Error} If no tasks have been added to the graph.
   */
  build() {
    if (!this.size) throw new Error("Unable to build TaskGraphRunner. No tasks added to the graph");
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
  /**
   * Runs the tasks in the graph in topological order.
   * Tasks are run concurrently when possible.
   * In the event a task fails, other independent tasks will continue to run.
   *
   * @returns A promise that resolves to the completed context object when all tasks have completed.
   */
  async run() {
    if (this._topologicalOrder.length === 0)
      throw new Error("No tasks to run. Did you forget to call topologicalSort?");
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
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Clujo,
  Scheduler,
  TaskGraph
});
//# sourceMappingURL=index.js.map