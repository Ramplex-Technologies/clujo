var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
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

// src/cron.ts
import Croner from "croner";
var Cron = class {
  constructor(cronExpression, cronOptions) {
    this.cronExpression = cronExpression;
    this.cronOptions = cronOptions;
  }
  job = null;
  start(handler) {
    if (this.job) throw new Error("Attempting to start an already started job");
    this.job = new Croner(this.cronExpression, this.cronOptions, handler);
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
          return;
        }
      };
      checkAndStop();
    });
  }
};

// src/clujo.ts
import { Mutex } from "redis-semaphore";
var Clujo = class {
  id;
  _cron;
  _taskGraphRunner;
  _hasStarted = false;
  _runImmediately = false;
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
  runOnStartup() {
    this._runImmediately = true;
    return this;
  }
  start({
    redis,
    onTaskCompletion
  } = {}) {
    if (this._hasStarted) throw new Error("Cannot start a Clujo that has already started.");
    const executeTasksAndCompletionHandler = async () => {
      const finalContext = await this._taskGraphRunner.run();
      if (onTaskCompletion) await onTaskCompletion(finalContext);
    };
    const handler = async () => {
      try {
        if (!redis) {
          await executeTasksAndCompletionHandler();
        } else {
          var _stack = [];
          try {
            const lock = __using(_stack, await this._tryAcquire(redis.client, redis.lockOptions), true);
            if (lock) {
              await executeTasksAndCompletionHandler();
            }
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
    if (this._runImmediately) this.trigger();
    return this;
  }
  async stop(timeout = 5e3) {
    if (!this._hasStarted) throw new Error("Cannot stop a Clujo that has not started.");
    await this._cron.stop(timeout);
  }
  async trigger() {
    return await this._taskGraphRunner.run();
  }
  async _tryAcquire(redis, lockOptions) {
    const mutex = new Mutex(redis, this.id, lockOptions);
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
    this.jobs.push(input);
  }
  /**
   * Starts all added jobs in the scheduler.
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
   * @param timeout - The maximum time (in milliseconds) to wait for jobs to stop.
   * @returns A promise that resolves when all jobs have stopped or the timeout is reached.
   */
  async stop(timeout) {
    await Promise.all(this.jobs.map(({ job }) => job.stop(timeout)));
  }
};

// src/task-graph.ts
import { promisify } from "node:util";

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
var sleep = promisify(setTimeout);
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
export {
  Clujo,
  Scheduler,
  TaskGraph
};
//# sourceMappingURL=index.mjs.map