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
export {
  Cron
};
//# sourceMappingURL=cron.mjs.map