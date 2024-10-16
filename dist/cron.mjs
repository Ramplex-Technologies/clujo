// src/cron.ts
import Croner from "croner";
var Cron = class {
  constructor(cronExpression, cronOptions) {
    this.cronExpression = cronExpression;
    this.cronOptions = cronOptions;
    this.job = null;
  }
  start(handler) {
    if (this.job) throw new Error("Attempting to start an already started job");
    this.job = new Croner(this.cronExpression, this.cronOptions, handler);
  }
  stop() {
    return new Promise((resolve) => {
      const checkAndStop = () => {
        if (this.job?.isBusy()) setTimeout(checkAndStop, 100);
        else {
          this.job?.stop();
          resolve();
        }
      };
      checkAndStop();
    });
  }
  async trigger() {
    if (!this.job) throw new Error("Attempting to trigger a non-started job");
    await this.job.trigger();
  }
};
export {
  Cron
};
//# sourceMappingURL=cron.mjs.map