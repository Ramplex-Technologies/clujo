import Croner, { type CronOptions } from "croner";
import type { ICron } from "./cron.types";

export class Cron implements ICron {
  private job: Croner | null = null;

  constructor(
    private readonly cronExpression: string,
    private readonly cronOptions?: CronOptions,
  ) {}

  start(handler: () => Promise<void> | void): void {
    if (this.job) throw new Error("Attempting to start an already started job");
    this.job = new Croner(this.cronExpression, this.cronOptions, handler);
  }

  stop(): Promise<void> {
    return new Promise<void>((resolve) => {
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
}
