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

// src/clujo.ts
var clujo_exports = {};
__export(clujo_exports, {
  Clujo: () => Clujo
});
module.exports = __toCommonJS(clujo_exports);
var import_redis_semaphore = require("redis-semaphore");

// src/_cron.ts
var import_croner = require("croner");
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
    this.#jobs = Array.isArray(this.#cronExpression) ? this.#cronExpression.map((expression) => new import_croner.Cron(expression, this.#cronOptions, wrapHandler)) : [new import_croner.Cron(this.#cronExpression, this.#cronOptions, handler)];
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
    const mutex = new import_redis_semaphore.Mutex(redis, this.#id, {
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Clujo
});
//# sourceMappingURL=clujo.js.map