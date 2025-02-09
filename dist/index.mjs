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

// src/clujo.ts
import { Mutex } from "redis-semaphore";

// src/_cron.ts
import { Cron as Croner } from "croner";
var Cron = class {
  #jobs = null;
  #cronExpression;
  #cronOptions;
  #isRunning = false;
  constructor(cronExpression, cronOptions) {
    this.#cronExpression = cronExpression;
    this.#cronOptions = { protect: true, ...cronOptions };
  }
  /**
   * Starts the cron job with the specified handler.
   *
   * @param handler A function to be executed when the cron job triggers.
   * @throws {Error} If attempting to start a job that has already been started.
   */
  start(handler) {
    if (this.#jobs) {
      throw new Error("Attempting to start an already started job");
    }
    const wrapHandler = async () => {
      if (this.#cronOptions?.protect && this.#isRunning) {
        return;
      }
      try {
        this.#isRunning = true;
        await handler();
      } finally {
        this.#isRunning = false;
      }
    };
    this.#jobs = Array.isArray(this.#cronExpression) ? this.#cronExpression.map((expression) => new Croner(expression, this.#cronOptions, wrapHandler)) : [new Croner(this.#cronExpression, this.#cronOptions, handler)];
  }
  /**
   * Stops the cron job. If the job is currently running, it will wait for the job to finish before stopping it.
   * This can be safely invoked even if the job hasn't been started.
   *
   * @param timeout The maximum time (in ms) to wait for the job to finish before stopping it forcefully.
   * @returns A promise that resolves when the job has been stopped
   */
  stop(timeout) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const checkAndStop = () => {
        if (!this.#jobs) {
          resolve();
          return;
        }
        if (this.#jobs.some((job) => job.isBusy())) {
          if (Date.now() - startTime > timeout) {
            for (const job of this.#jobs) {
              job.stop();
              this.#jobs = null;
            }
            resolve();
            return;
          }
          setTimeout(checkAndStop, 100);
        } else {
          for (const job of this.#jobs) {
            job.stop();
          }
          this.#jobs = null;
          resolve();
          return;
        }
      };
      checkAndStop();
    });
  }
  /**
   * Triggers the cron job to run immediately. A triggered execution will prevent the job from running at its scheduled time
   * unless `protect` is set to `false` in the cron options.
   *
   * @throws {Error} If attempting to trigger a job that is not running.
   */
  async trigger() {
    if (!this.#jobs) {
      throw new Error("Attempting to trigger a job that is not running");
    }
    await this.#jobs[0].trigger();
  }
};

// src/clujo.ts
var Clujo = class {
  #id;
  #cron;
  #taskGraphRunner;
  #redis;
  #enabled;
  #logger;
  #hasStarted = false;
  #runOnStartup = false;
  constructor({
    id,
    taskGraphRunner,
    cron,
    enabled,
    runOnStartup,
    redis,
    logger
  }) {
    logger?.debug?.(`Initializing Clujo instance with ID: ${id}`);
    if (!id) {
      throw new Error("Clujo ID is required.");
    }
    if (!taskGraphRunner) {
      throw new Error("taskGraphRunner is required");
    }
    if (!("pattern" in cron || "patterns" in cron)) {
      throw new Error("Either cron.pattern or cron.patterns is required.");
    }
    if ("pattern" in cron && !cron.pattern) {
      throw new Error("cron.pattern is required");
    }
    if ("patterns" in cron && !cron.patterns) {
      throw new Error("cron.patterns is required");
    }
    if (enabled && typeof enabled !== "boolean") {
      throw new Error("enabled must be a boolean");
    }
    if (runOnStartup && typeof runOnStartup !== "boolean") {
      throw new Error("runOnStartup must be a boolean.");
    }
    if (redis && !redis.client) {
      throw new Error("Redis client is required in redis input.");
    }
    if (redis) {
      logger?.debug?.(`Redis configuration provided for Clujo ${id}`);
    }
    if (enabled === false) {
      logger?.log?.(`Clujo instance ${id} initialized in disabled state`);
    }
    if (runOnStartup) {
      logger?.debug?.(`Clujo ${id} configured to run on startup`);
    }
    this.#id = id;
    this.#taskGraphRunner = taskGraphRunner;
    this.#cron = new Cron("pattern" in cron ? cron.pattern : cron.patterns, cron.options);
    this.#runOnStartup = Boolean(runOnStartup);
    this.#enabled = enabled ?? true;
    this.#redis = redis;
    this.#logger = logger;
    logger?.log?.(`Clujo instance ${id} successfully initialized`);
  }
  get id() {
    return this.#id;
  }
  /**
   * Starts the cron job, which will execute the task graph according to the cron schedule.
   * @throws An error if the Clujo has already started.
   */
  start() {
    this.#logger?.debug?.(`Attempting to start Clujo ${this.#id}`);
    if (this.#hasStarted) {
      this.#logger?.error?.(`Failed to start Clujo ${this.#id}: already started`);
      throw new Error("Cannot start a Clujo that has already started.");
    }
    const handler = async () => {
      this.#logger?.debug?.(`Cron trigger received for Clujo ${this.#id}`);
      if (!this.#enabled) {
        this.#logger?.log?.(`Skipping execution - Clujo ${this.#id} is disabled`);
        return;
      }
      try {
        if (!this.#redis) {
          this.#logger?.debug?.(`Executing task graph for Clujo ${this.#id} without distributed lock`);
          await this.#taskGraphRunner.trigger();
          this.#logger?.log?.(`Successfully completed task graph execution for Clujo ${this.#id}`);
        } else {
          var _stack = [];
          try {
            this.#logger?.debug?.(`Attempting to acquire distributed lock for Clujo ${this.#id}`);
            const lock = __using(_stack, await this.#tryAcquire(this.#redis.client, this.#redis.lockOptions), true);
            if (lock) {
              this.#logger?.debug?.(`Executing task graph for Clujo ${this.#id} with distributed lock`);
              await this.#taskGraphRunner.trigger();
              this.#logger?.log?.(`Successfully completed task graph execution for Clujo ${this.#id}`);
            } else {
              this.#logger?.log?.(`Skipping execution - Could not acquire lock for Clujo ${this.#id}`);
            }
          } catch (_) {
            var _error = _, _hasError = true;
          } finally {
            var _promise = __callDispose(_stack, _error, _hasError);
            _promise && await _promise;
          }
        }
      } catch (error) {
        this.#logger?.error?.(`Task graph execution failed for Clujo ${this.#id}: ${error}`);
      }
    };
    this.#cron.start(handler);
    this.#hasStarted = true;
    this.#logger?.log?.(`Clujo ${this.#id} started successfully`);
    if (this.#runOnStartup) {
      void this.#cron.trigger();
    }
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
    this.#logger?.debug?.(`Attempting to stop Clujo ${this.#id} with timeout ${timeout}ms`);
    if (!this.#hasStarted) {
      this.#logger?.error?.(`Failed to stop Clujo ${this.#id}: not started`);
      throw new Error("Cannot stop a Clujo that has not started.");
    }
    try {
      await this.#cron.stop(timeout);
      this.#logger?.log?.(`Clujo ${this.#id} stopped successfully`);
    } catch (error) {
      this.#logger?.error?.(`Failed to stop Clujo ${this.#id}: ${error}`);
      throw error;
    }
  }
  /**
   * Trigger an execution of the task graph immediately, independent of the cron schedule.
   * In the event the cron is running, the task graph will still execute.
   *
   * @returns The final context of the task graph.
   */
  async trigger() {
    this.#logger?.debug?.(`Manual trigger initiated for Clujo ${this.#id}`);
    try {
      const result = await this.#taskGraphRunner.trigger();
      this.#logger?.log?.(`Manual trigger completed successfully for Clujo ${this.#id}`);
      return result;
    } catch (error) {
      this.#logger?.error?.(`Manual trigger failed for Clujo ${this.#id}: ${error}`);
      throw error;
    }
  }
  /**
   * Tries to acquire a lock from redis-semaphore. If the lock is acquired, the lock will be released when the lock is disposed.
   *
   * @param redis The Redis client to use.
   * @param lockOptions The options to use when acquiring the lock.
   *
   * @returns An AsyncDisposable lock if it was acquired, otherwise null.
   */
  async #tryAcquire(redis, lockOptions) {
    this.#logger?.debug?.(`Attempting to acquire mutex for Clujo ${this.#id}`);
    const mutex = new Mutex(redis, this.#id, {
      acquireAttemptsLimit: 1,
      lockTimeout: 3e4,
      refreshInterval: 24e3,
      onLockLost: (lockLostError) => {
        this.#logger?.error?.(`Lock lost for Clujo ${this.#id}: ${lockLostError.message}`);
        throw lockLostError;
      },
      ...lockOptions
    });
    try {
      const lock = await mutex.tryAcquire();
      if (!lock) {
        this.#logger?.debug?.(
          `Could not acquire mutex for Clujo ${this.#id} - another instance is likely running`
        );
        return null;
      }
      this.#logger?.debug?.(`Successfully acquired mutex for Clujo ${this.#id}`);
      return {
        mutex,
        [Symbol.asyncDispose]: async () => {
          try {
            await mutex.release();
            this.#logger?.debug?.(`Successfully released mutex for Clujo ${this.#id}`);
          } catch (error) {
            this.#logger?.error?.(`Failed to release mutex for Clujo ${this.#id}: ${error}`);
            throw error;
          }
        }
      };
    } catch (error) {
      this.#logger?.error?.(`Failed to acquire mutex for Clujo ${this.#id}: ${error}`);
      throw error;
    }
  }
};

// src/error.ts
var TaskError = class extends Error {
  id;
  error;
  constructor(id, error) {
    super(`Task ${id} failed: ${error.message}`);
    this.id = id;
    this.error = error;
    this.name = "TaskError";
  }
};

// src/scheduler.ts
var Scheduler = class {
  #jobs = [];
  /**
   * Adds a Clujo job to the scheduler.
   * @param input - Object containing the job and optional completion handler.
   * @param input.job - The Clujo job to be added.
   * @param input.completionHandler - Optional function to invoke after the job completes.
   */
  // biome-ignore lint/suspicious/noExplicitAny: handle any Clujo
  addJob(job) {
    if (this.#jobs.some((addedJob) => addedJob.id === job.id)) {
      throw new Error(`Job with id ${job.id} is already added to the scheduler.`);
    }
    this.#jobs.push(job);
  }
  /**
   * Starts all added jobs in the scheduler.
   *
   * @param redis - Optional Redis instance to be passed to the jobs. If provided, enables distributed locking.
   */
  start() {
    for (const job of this.#jobs) {
      job.start();
    }
  }
  /**
   * Stops all running jobs in the scheduler.
   *
   * @param timeout - The maximum time (in milliseconds) to wait for jobs to stop. Defaults to 5000ms.
   * @returns A promise that resolves when all jobs have stopped or the timeout is reached.
   */
  async stop(timeout = 5e3) {
    await Promise.all(this.#jobs.map((job) => job.stop(timeout)));
  }
  /**
   * Returns the list of jobs added to the scheduler.
   */
  get jobs() {
    return this.#jobs;
  }
};

// src/_context.ts
var Context = class {
  #object;
  #updateQueue;
  constructor(initialValue) {
    this.reset(initialValue);
    this.#updateQueue = Promise.resolve();
  }
  /**
   * Gets the current state of the managed object.
   */
  get value() {
    return this.#object;
  }
  /**
   * Resets the context to its initial state or a new initial object.
   */
  reset(initialValue) {
    if (initialValue !== void 0 && initialValue !== null) {
      this.#object = deepFreeze({ initial: initialValue });
    } else {
      this.#object = deepFreeze({ initial: void 0 });
    }
  }
  /**
   * Asynchronously updates the context with new values. Ensures that updates are applied in the order they are called.
   */
  update(updateValue) {
    this.#updateQueue = this.#updateQueue.then(() => {
      this.#object = deepFreeze({ ...this.#object, ...updateValue });
      return Promise.resolve();
    });
    return this.#updateQueue;
  }
};
function deepFreeze(obj) {
  const propNames = Reflect.ownKeys(obj);
  for (const name of propNames) {
    const value = obj[name];
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return Object.freeze(obj);
}

// src/_dependency-map.ts
var DependencyMap = class {
  #dependencies = /* @__PURE__ */ Object.create(null);
  add(key, value) {
    if (!this.#dependencies[key]) {
      this.#dependencies[key] = [];
    }
    this.#dependencies[key].push(value);
  }
  get(key) {
    return Object.freeze(this.#dependencies[key]?.slice() ?? []);
  }
};

// src/_task.ts
import { promisify } from "node:util";
var Task = class {
  #options;
  #retryPolicy = { maxRetries: 0, retryDelayMs: 0 };
  #status = "pending";
  constructor(options) {
    if (options.retryPolicy) {
      this.#validateRetryPolicy(options.retryPolicy);
      this.#retryPolicy = options.retryPolicy;
    }
    this.#options = options;
  }
  /**
   * Return whether this task is enabled or not
   */
  get isEnabled() {
    return this.#options.enabled === void 0 || this.#options.enabled;
  }
  /**
   * Gets the ID of the task.
   *
   * @returns The task ID
   */
  get id() {
    return this.#options.id;
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
    if (!this.isEnabled) {
      this.#status = "skipped";
      return null;
    }
    const input = {
      deps,
      ctx
    };
    for (let attempt = 0; attempt < this.#retryPolicy.maxRetries + 1; attempt++) {
      try {
        this.#status = "running";
        const result = await this.#options.execute(input);
        this.#status = "completed";
        return result;
      } catch (err) {
        if (attempt === this.#retryPolicy.maxRetries) {
          console.error(`Task failed after ${attempt + 1} attempts: ${err}`);
          const error = err instanceof Error ? err : new Error(`Non error throw: ${String(err)}`);
          try {
            if (this.#options.errorHandler) {
              await this.#options.errorHandler(error, input);
            } else {
              console.error(`Error in task ${this.#options.id}: ${err}`);
            }
          } catch (error2) {
            console.error(`Error in task error handler for ${this.#options.id}: ${error2}`);
          }
          this.#status = "failed";
          throw error;
        }
        console.error(`Task failed, retrying (attempt ${attempt + 1}/${this.#retryPolicy.maxRetries}): ${err}`);
        await sleep(this.#retryPolicy.retryDelayMs);
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
    return this.#status;
  }
  #validateRetryPolicy(retryPolicy) {
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
  #contextValueOrFactory = void 0;
  #dependencies = /* @__PURE__ */ Object.create(null);
  #tasks = /* @__PURE__ */ new Map();
  #taskDependencies = new DependencyMap();
  #topologicalOrder = [];
  constructor(options) {
    if (!options) {
      return;
    }
    if ("dependencies" in options) {
      if (options.dependencies === void 0) {
        this.#dependencies = /* @__PURE__ */ Object.create(null);
      } else if (!this.#isValidDependencies(options.dependencies)) {
        throw new Error("Dependencies must be a non-null object with defined properties");
      } else {
        this.#dependencies = options.dependencies;
      }
    }
    if ("contextValue" in options && "contextFactory" in options) {
      throw new Error("Cannot specify both contextValue and contextFactory");
    }
    if ("contextValue" in options) {
      if (options.contextValue !== void 0) {
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
  addTask(options) {
    const taskId = options.id;
    if (this.#tasks.has(taskId)) {
      throw new Error(`Task with id ${taskId} already exists`);
    }
    const task = new Task(options);
    for (const depId of options.dependencies ?? []) {
      if (typeof depId !== "string") {
        throw new Error("Dependency ID must be a string");
      }
      if (depId === taskId) {
        throw new Error(`Task ${taskId} cannot depend on itself`);
      }
      const dependentTask = this.#tasks.get(depId);
      if (!dependentTask) {
        throw new Error(`Dependency ${depId} not found for task ${taskId}`);
      }
      this.#taskDependencies.add(taskId, depId);
    }
    this.#tasks.set(taskId, task);
    return this;
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
    onTasksCompleted
  } = {}) {
    if (!this.size) {
      throw new Error("Unable to build TaskGraphRunner. No tasks added to the graph");
    }
    if (onTasksCompleted && typeof onTasksCompleted !== "function") {
      throw new Error("onTasksCompleted must be a function (sync or async).");
    }
    this.#topologicalSort();
    return new TaskGraphRunner(
      this.#dependencies,
      this.#contextValueOrFactory,
      this.#topologicalOrder,
      this.#tasks,
      this.#taskDependencies,
      onTasksCompleted
    );
  }
  /**
   * Returns the number of tasks in the graph.
   */
  get size() {
    return this.#tasks.size;
  }
  /**
   * Topologically sorts the tasks in the graph, placing the sorted order in the `_topologicalOrder` array.
   */
  #topologicalSort() {
    const visited = /* @__PURE__ */ new Set();
    const temp = /* @__PURE__ */ new Set();
    const visit = (taskId) => {
      if (temp.has(taskId)) {
        throw new Error(`Circular dependency detected involving task ${taskId}`);
      }
      if (!visited.has(taskId)) {
        temp.add(taskId);
        for (const depId of this.#taskDependencies.get(taskId)) {
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
  #isValidDependencies(deps) {
    return typeof deps === "object" && deps !== null && !Array.isArray(deps) && Object.entries(deps).every(([key, value]) => typeof key === "string" && value !== void 0);
  }
};
var TaskGraphRunner = class {
  #context = new Context();
  #dependencies;
  #contextValueOrFactory;
  #topologicalOrder;
  #tasks;
  #taskDependencies;
  #onTasksCompleted;
  #errors = [];
  constructor(dependencies, contextValueOrFactory, topologicalOrder, tasks, taskDependencies, onTasksCompleted) {
    this.#dependencies = dependencies;
    this.#contextValueOrFactory = contextValueOrFactory;
    this.#topologicalOrder = topologicalOrder;
    this.#tasks = tasks;
    this.#taskDependencies = taskDependencies;
    this.#onTasksCompleted = onTasksCompleted;
  }
  async #run() {
    if (this.#topologicalOrder.length === 0) {
      throw new Error("No tasks to run. Did you forget to call topologicalSort?");
    }
    let value;
    if (this.#contextValueOrFactory) {
      value = typeof this.#contextValueOrFactory === "function" ? await this.#contextValueOrFactory(this.#dependencies) : this.#contextValueOrFactory;
      this.#context.reset(value);
    }
    const completed = /* @__PURE__ */ new Set();
    const running = /* @__PURE__ */ new Map();
    const readyTasks = new Set(
      this.#topologicalOrder.filter((taskId) => {
        const task = this.#tasks.get(taskId);
        if (!task) {
          throw new Error(`Task ${taskId} not found`);
        }
        return task.isEnabled && this.#taskDependencies.get(taskId).length === 0;
      })
    );
    const runTask = async (taskId) => {
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
        completed.add(taskId);
      } finally {
        running.delete(taskId);
        for (const [id, t] of this.#tasks) {
          if (!completed.has(id) && !running.has(id)) {
            const canRun = t.isEnabled && this.#taskDependencies.get(t.id).every((depId) => {
              const depTask = this.#tasks.get(depId);
              return depTask && completed.has(depId) && depTask.status === "completed" && depTask.isEnabled;
            });
            if (canRun) {
              readyTasks.add(id);
            }
          }
        }
      }
    };
    while (completed.size < this.#tasks.size) {
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
    if (this.#onTasksCompleted) {
      await this.#onTasksCompleted(
        this.#context.value,
        this.#dependencies,
        this.#errors.length > 0 ? this.#errors : null
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
  async trigger() {
    try {
      return await this.#run();
    } finally {
      this.#context.reset(void 0);
    }
  }
  printTaskGraph() {
    if (this.#tasks.size === 0) {
      return "Empty task graph";
    }
    const visited = /* @__PURE__ */ new Set();
    const output = [];
    const getIndent = (level) => "  ".repeat(level);
    const printTask = (taskId, level = 0, parentChain = /* @__PURE__ */ new Set()) => {
      if (parentChain.has(taskId)) {
        output.push(`${getIndent(level)}${taskId} (circular dependency!)`);
        return;
      }
      const task = this.#tasks.get(taskId);
      if (!task) {
        return;
      }
      visited.add(taskId);
      const prefix = level === 0 ? "\u2514\u2500 " : "\u251C\u2500 ";
      output.push(`${getIndent(level)}${prefix}${taskId}${task.isEnabled ? "" : " (Disabled)"}`);
      const newParentChain = new Set(parentChain).add(taskId);
      const dependencies = Array.from(this.#taskDependencies.get(task.id));
      dependencies.forEach((depId, index) => {
        if (!visited.has(depId)) {
          printTask(depId, level + 1, newParentChain);
        } else {
          const prefix2 = index === dependencies.length - 1 ? "\u2514\u2500 " : "\u251C\u2500 ";
          output.push(`${getIndent(level + 1)}${prefix2}${depId} (already shown)`);
        }
      });
    };
    const rootTasks = Array.from(this.#tasks.entries()).filter(([_, task]) => this.#taskDependencies.get(task.id).length === 0).map(([id]) => id);
    for (const taskId of rootTasks) {
      if (!visited.has(taskId)) {
        printTask(taskId);
      }
    }
    this.#tasks.forEach((_, taskId) => {
      if (!visited.has(taskId)) {
        printTask(taskId);
      }
    });
    return output.join("\n");
  }
};

// src/index.ts
var index_default = {
  Clujo,
  Scheduler,
  TaskError,
  TaskGraph
};
export {
  Clujo,
  Scheduler,
  TaskError,
  TaskGraph,
  index_default as default
};
//# sourceMappingURL=index.mjs.map