// src/scheduler.ts
var Scheduler = class {
  constructor() {
    // biome-ignore lint/suspicious/noExplicitAny: handle any combination of clujo's
    this.jobs = [];
  }
  addJob(input) {
    this.jobs.push(input);
  }
  start(redis) {
    for (const { job } of this.jobs) {
      job.start({ redis });
    }
  }
  async stop() {
    await Promise.all(this.jobs.map(({ job }) => job.stop()));
  }
};
export {
  Scheduler
};
//# sourceMappingURL=scheduler.mjs.map