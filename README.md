# clujo

Clujo is a flexible solution for managing scheduled tasks in distributed systems. At a glance:

- Clujo provides an intuitive interface for setting up cron-like schedules, making it easy to create and manage recurring tasks without the complexity of traditional cron systems.
- Clujo's task orchestration allows you to define and execute a set of interdependent tasks. It analyzes task dependencies to determine the execution order, running independent tasks in parallel when possible while ensuring dependent tasks wait for their prerequisites. 
- With Clujo, you can define a series of tasks that execute sequentially, allowing for complex workflows and dependencies between tasks. This ensures that your operations run in the correct order every time.
- Clujo's context system allows you to pass and modify state between tasks, enabling sophisticated data flow and making it easier to build complex, stateful workflows.
- Clujo includes a configurable retry policy, enabling your tasks to automatically recover from transient failures without manual intervention.
- When used with Redis, Clujo provides out-of-the-box distributed locking. This ensures that only one instance of your scheduled task runs at a time, preventing overlapping executions in a distributed environment.
- Clujo offers type-safe task definitions and context management
- With the `runOnStartup` and `trigger` features, Clujo allows you to run tasks immediately when needed, in addition to their scheduled times.
- Clujo provides a graceful way to stop scheduled tasks, ensuring that your application can shut down without leaving tasks in an inconsistent state.
- Each task can have its own (sync or async) error handler, allowing for fine-grained control over how failures are managed and reported.

# Installation

### npm

```bash
npm install clujo
```

### pnpm

```bash
pnpm install clujo
```

### yarn

```bash
yarn add clujo
```

## Quick Start

Here's a simple example to get you started with Clujo:

### Getting ready to start

```typescript
import { ClujoBuilder } from 'clujo';

const clujo = new ClujoBuilder("testJobUniqueId")
  .setSchedule("0/10 * * * * *")                                    // Run every 10 seconds  -- MUST be invoked before building
  .setRetryPolicy({ maxRetries: 3, retryDelayMs: 1000 })            // Retry a failed task up to 3 times with 1 second delay between retries
  .setContext(async () => {                                         // Set the context for the job -- the first task will receive this context on every run
    return await db.query("SELECT * FROM users");
  })
  .setDependencies({ logger: loggerFactory.createLogger("name") })  // Set dependencies for the job -- all tasks will have access to these dependencies
  .runOnStartup()                                                   // Run the job immediately on startup independent of the schedule set
  .build()                                                          // Generate a Clujo instance

clujo
  .addTask({
    taskId: "task1",                                                // unique task id within this clujo
    execute: async ({ deps, ctx }) => {
      // wait 1 second and log
      deps.logger.debug("HELLO 1 START");
      console.debug(ctx);                                           // initial query
      await sleep(1000);
      deps.logger.debug("HELLO 1 END");
      return 10;                                                    // all tasks that depend on `task1` have access to this return under ctx.task1
    },
  })
  .addTask({
    taskId: "task2",
    execute: async ({ deps, ctx }) => {
      // wait 1 second and log
      deps.logger.debug("HELLO 2 START");
      console.debug(ctx);
      await sleep(1000);
      deps.logger.debug("HELLO 2 END");
      return 20;
    },
    dependencies: ["task1"],
  })
  .addTask({
    taskId: "task3",
    execute: async ({ deps, ctx }) => {
      // wait 1 second and log
      deps.logger.debug("HELLO 3 START");
      console.debug(ctx);
      await sleep(1000);
      deps.logger.debug("HELLO 3 END");
      return 30;
    },
  });

// final context object is
// {
//    "initial" resultFromDbQuery,
//    "task1": 10,
//    "task2": 20,
//    "task3": 30 
// }
```

### Starting, triggering, and stopping the job

```typescript
// start the job
clujo.start(); // all processes will run the set of tasks
// or
clujo.start({redis}) // only one process will run the set of tasks
// or
clujo.start({redis})

// trigger the job -- this is a Promise which resolves when all tasks have completed
await clujo.trigger();

// stop the job -- this is a Promise which resolves when all tasks have completed their current run and the job is stopped
// if the job is not running, the Promise resolves immediately.
await clujo.stop();
```