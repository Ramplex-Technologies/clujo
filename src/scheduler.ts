import type Redis from "ioredis";
import type { IClujo } from "./clujo.types";

export class Scheduler {
  // biome-ignore lint/suspicious/noExplicitAny: handle any combination of clujo's
  private readonly jobs: {job: IClujo<any, any, any>; completionHandler: (ctx: any) => Promise<void> | void; }[] = [];

  addJob<TDependencies, TContext>(input: {
    // biome-ignore lint/suspicious/noExplicitAny: I do not want to type this
    job: IClujo<TDependencies, TContext, any>;
    completionHandler: (ctx: Required<TContext>) => Promise<void> | void;
  }) {
    this.jobs.push(input);
  }

  start(redis?: Redis) {
    for (const { job, completionHandler } of this.jobs) {
      job.start({ redis, completionHandler });
    }
  }

  async stop() {
    await Promise.all(this.jobs.map(({ job }) => job.stop()));
  }
}
