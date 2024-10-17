import Croner, { type CronOptions } from "croner";

export class Cron {
  private job: Croner | null = null;

  constructor(
    private readonly cronExpression: string,
    private readonly cronOptions?: CronOptions,
  ) {}

  start(handler: () => Promise<void> | void): void {
    if (this.job) throw new Error("Attempting to start an already started job");
    this.job = new Croner(this.cronExpression, this.cronOptions, handler);
  }

  stop(timeout: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const startTime = Date.now();
      const checkAndStop = () => {
        if (!this.job) {
          resolve(); // resolve if job has cleared
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
}
