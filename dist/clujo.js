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
    if (this._hasStarted) throw new Error("Cannot run on startup after starting a Clujo.");
    this._runImmediately = true;
    return this;
  }
  start({
    redis,
    onTaskCompletion
  } = {
    redis: void 0,
    onTaskCompletion: void 0
  }) {
    if (this._hasStarted) throw new Error("Cannot start a Clujo that has already started.");
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
    if (this._runImmediately) this._cron.trigger();
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Clujo
});
//# sourceMappingURL=clujo.js.map