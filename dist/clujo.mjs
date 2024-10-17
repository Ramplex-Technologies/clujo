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
export {
  Clujo
};
//# sourceMappingURL=clujo.mjs.map