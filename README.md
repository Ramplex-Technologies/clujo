# clujo

**IMPORTANT**: clujo is now published under `@ramplex/clujo` on npm and jsr. If you are using the old `clujo` package, please update your dependencies to use `@ramplex/clujo` instead. All future versions will be published under the new package name.

Clujo is a flexible solution for managing scheduled tasks in your distributed Node.js / Deno applications. It would not be possible without the amazing work of the following projects:

- [Croner](https://github.com/Hexagon/croner/tree/master?tab=readme-ov-file): used for running task graphs on a cron schedule
- [ioredis](https://github.com/redis/ioredis) - (not a dependency, but the supported redis client) used to ensure single execution in a clustered/distributed environment
- [redis-semaphore](https://github.com/swarthy/redis-semaphore) (only used if an `ioredis` instance is provided to start method) - used to ensure single execution in a distributed environment

Coming soon: validated bun support.

# Table of Contents

- [Features](#features)
- [Installation](#installation)
    - [npm](#npm-registry)
    - [jsr](jsr-registry)
- [Quick Start](#quick-start)
    [Using the Task Graph](#using-the-task-graph)
- [Advanced Usage](#advanced-usage)
  - [Understanding Dependency Execution](#understanding-dependency-execution)
    - [Context object](#context-object)
    - [Task execution](#task-execution)
  - [Disabling Execution](#disabling-execution)
    - [Disabling a Clujo](#disabling-a-clujo)
    - [Disabling a Task](#disabling-a-task)
  - [Visualizing Task Dependencies](#visualizing-task-dependencies)
  - [Setting Context and Dependencies](#setting-context-and-dependencies)
  - [Logging](#logging)
  - [Using Redis for Distributed Locking](#using-redis-for-distributed-locking)
  - [Running Tasks on Startup](#running-tasks-on-startup)
  - [Error Handling](#error-handling)
  - [Retry Policy](#retry-policy)
- [Using the Scheduler](#using-the-scheduler)
  - [Adding Jobs to the Scheduler](#adding-jobs-to-the-scheduler)
  - [Starting All Jobs](#starting-all-jobs)
  - [Stopping All Jobs](#stopping-all-jobs)
- [Contributing](#contributing)
- [License](#license)

# Features

- Clujo provides an intuitive interface for setting up cron-like schedules, making it easy to create and manage recurring tasks.
- Clujo's task orchestration allows you to define and execute a set of interdependent tasks, running independent tasks in parallel when possible while ensuring dependent tasks wait for their prerequisites.
- Clujo's context system allows you to pass and modify state between tasks, enabling sophisticated data flow and making it easier to build complex, stateful workflows, with type safety in mind.
- Clujo includes a configurable retry policy, enabling your tasks to automatically recover from transient failures without manual intervention.
- When used with Redis, Clujo provides out-of-the-box distributed locking, preventing overlapping executions in a distributed environment.
- Clujo offers type-safe task definitions and context management.
- With the `runOnStartup` feature, Clujo allows you to run tasks immediately when needed, in addition to their scheduled times.
- Clujo provides a graceful way to stop scheduled tasks, ensuring that your application can shut down without leaving tasks in an inconsistent state.
- Each task can have its own error handler, allowing for fine-grained control over how failures are managed and reported.

# Installation

Clujo is available on [jsr](https://jsr.io/@ramplex/clujo) and [npm](https://www.npmjs.com/package/clujo), and supports
Node.js and Deno v2.0.0 or later.


## npm registry

Install Clujo using npm, pnpm, yarn:

```bash
npm install @ramplex/clujo
yarn add @ramplex/clujo
pnpm install @ramplex/clujo
```

## jsr registry

### deno

```bash
deno add jsr:@ramplex/clujo
```

### npm (one of the below, depending on your package manager)

```bash
npx jsr add @ramplex/clujo
yarn dlx jsr add @ramplex/clujo
pnpm dlx jsr add @ramplex/clujo
```

# Quick Start

Here's a simple example to get you started with Clujo:

```typescript
import { TaskGraph, Clujo } from '@ramplex/clujo';
// or (in node.js)
// const { TaskGraph, Clujo } = require('@ramplex/clujo');

// Define your tasks
const tasks = new TaskGraph({
  // Optional: provide initial context value
  contextValue: { initialData: "some value" },
  // Optional: provide dependencies available to all tasks
  dependencies: { logger: console }
})
  .addTask({
    id: "task1",
    execute: async ({ deps, ctx }) => {
      deps.logger.log("Task 1 executing");
      deps.logger.log("Initial data:", ctx.initial.initialData);
      return "Task 1 result";
    },
  })
  .addTask({
    id: "task2",
    execute: async ({ deps, ctx }) => {
      deps.logger.log("Task 2 executing");
      // since task2 depends on task1, it will have access to the result of task1
      deps.logger.log("Task 1 result:", ctx.task1);
      return "Task 2 result";
    },
    // will only execute after task 1 completes
    dependencies: ["task1"],
  })
  .addTask({
    id: "task3",
    execute: async ({ deps, ctx }) => {
      deps.logger.log("Task 3 executing");
      return "Task 3 result";
    },
    // since task3 has no dependencies, it will run in parallel with task1 at the start of execution and it does not have guaranteed access to any other task's result
  })
  .build({
      // Optional: provide a (sync or async) function to run when the task graph completes execution that takes in the completed context object
      // dependencies, and errors (list of TaskError for each task that failed if any errors occurred, otherwise null)
      onTasksCompleted: (ctx, deps, errors) => console.log(ctx, deps, errors),
  });

// Create a Clujo instance
const clujo = new Clujo({
  id: "myClujoJob",
  cron: {
    // You can provide either a single pattern
    pattern: "*/5 * * * * *", // Every 5 seconds
    // OR multiple patterns
    patterns: [
      "*/5 * * * * *",    // Every 5 seconds
      "0 */2 * * *",      // Every 2 hours
      new Date("2024-12-25T00:00:00") // One-time execution on Christmas
    ],
    // Optional: provide options for the Cron run (Croner `CronOptions`)
    options: { tz: "America/New_York" }
  },
  taskGraphRunner: tasks,
  // Optional: provide an ioredis client for distributed locking
  // In a clustered / multi-instance environment, this will prevent overlapping executions
  redis: { client: new Redis() },
  // Optional: run the job immediately on startup, independent of the schedules
  runOnStartup: true,
});

// Start the job
clujo.start();

// Trigger the job manually to get a complete context object
const completedContext = await clujo.trigger();

// Gracefully stop the job by waiting until the current execution completes
// Will force stop after timeout milliseconds
await clujo.stop(timeoutMs);
```

In the event a Javascript `Date` object is provided in the patterns array or as a singular pattern, the task graph
will be executed precisely once at the specific date/time specified for that pattern. Time is in ISO 8601 local time.
When using multiple patterns, if executions overlap, Clujo will prevent concurrent executions.

## Using the Task Graph

There is no need to use `Clujo` to execute the `TaskGraphRunner` that is instantiated when invoking `TaskGraph.build`.
The graph can be invoked as desired via the `trigger` function, i.e.,

```typescript
const completedContext = await tasks.trigger()
```

If provided, the `onTaskCompleted` will invoke before the promise resolves.

# Advanced Usage

## Understanding Dependency Execution

### Context object

The context object contains the appropriate context for the task.

 - All tasks have access to a context object which allows sharing values between tasks
 - If task `i` depends on tasks `j_1,...,j_n`, then it can be guaranteed the context object will have the result of tasks `j_1,...,j_n` under the keys `j_1,...,j_n`. The value at these keys is the return of task `j_i`, `i = 1,...,n`.
 - The context object is read-only. Modifying the context object directly will not be reflected in the context object and will result in a runtime error (in strict mode).
 - If a task has no dependencies it has guaranteed access to the initial context object only (if it was set).
 - A task attempting to access a task result from a task it does not depend on is undefined behavior. If the task has run,
    the value will be present in the context object, but it is not guaranteed to be present.

### Task execution

  - case: N tasks each with no dependencies. All tasks run concurrently
  - case: N tasks where task i depends on task `i-1`, `i=1,...,N`. All tasks run sequentially
  - case: Fix `1 <= i != j <= N`. N tasks where task `i` depends on task `j`. `N\{i}` tasks run concurrently, task `i` runs after task `j`.
  - case: Task `i` depends on task `j`, task `j` depends on task `i`. Cyclic dependencies will result in an error pre-execution.

In the event a task execution fails, or a task is disabled, all further dependent tasks will not be executed. Other independent tasks will continue to run.

More complex cases can be built from the above examples.

## Disabling Execution

You can disable either the whole `Clujo` or individual tasks via the `enabled` option.

### Disabling a Clujo

To disable a `Clujo` from executing on it's schedule, use the `enabled` option in the constructor:

```typescript
const clujo = new Clujo({
  id: "myClujoJob",
  cron: {
    // every 3 minute at the top of the minute from 8AM to midnight
    // every 15 minutes at the top of the minute from midnight to 8AM
    patterns: ["*/3 8-23 * * *", "*/15 0-7 * * *"],
  },
  // built task graph
  taskGraphRunner: tasks,
  redis: { client: new Redis() },
  runOnStartup: true,
  enabled: process.env.NODE_ENV !== "development"
});
```

This will still run on the given schedule, but the handler will warn that the Clujo is disabled and skip execution.

### Disabling a Task

If you do not want to disable the whole Clujo, but instead disable a task (and all tasks that depend on it), you can
use the `enabled` option in the `TaskGraph.addTask` function. The following unit test exhibits the intended behavior.

```typescript
await t.test("trigger skips tree of disabled tasks", async () => {
    const executionOrder: string[] = [];
    const taskGraph = new TaskGraph()
        .addTask({
            id: "task1",
            execute: () => {
                executionOrder.push("task1");
                return "result1";
            },
        })
        .addTask({
            id: "task2",
            dependencies: ["task1"],
            execute: () => {
                executionOrder.push("task2");
                return "result2";
            },
        })
        // will skip since it is not enabled
        .addTask({
            id: "task3",
            execute: () => {
                executionOrder.push("task3");
                return "result3";
            },
            enabled: false,
        })
        // will skip since it depends on a task that is not enabled
        .addTask({
            id: "task4",
            dependencies: ["task1", "task3"],
            execute: () => {
                executionOrder.push("task4");
                return "result4";
            },
        });

    const runner = taskGraph.build();
    const result = await runner.trigger();

    assert.deepEqual(executionOrder, ["task1", "task2"]);
    assert.deepEqual(result, {
        initial: undefined,
        task1: "result1",
        task2: "result2",
    });
});
```

## Visualizing Task Dependencies

You can visualize the task graph dependency structure by using the `printTaskGraph` option on the `TaskGraphRunner`:

```typescript
taskGraphRunner.printTaskGraph();
```

This will print a visual representation of your task graph to the console. For example:

```
test Structure:
└─ task1
  ├─ task4
└─ task2
  ├─ task3
```

## Setting Context and Dependencies

```typescript
// Using a static context value
const tasks = new TaskGraph({
  contextValue: { users: [], config: {} },
  dependencies: { logger: console }
})
  .addTask({
    id: "task1",
    execute: ({ deps, ctx }) => {
      deps.logger.log(ctx.initial.users);
      return "result";
    }
  })
  .build();

// Using a (sync or async) context factory
const tasks = new TaskGraph({
  contextFactory: async (deps) => {
    const users = await fetchUsers();
    return { users };
  },
  dependencies: { logger: console }
})
  .addTask({
    id: "task1",
    execute: ({ deps, ctx }) => {
      deps.logger.log(ctx.initial.users);
      return "result";
    }
  })
  .build();
```

The context and dependencies are type-safe, ensuring you can only access properties that actually exist.
Tasks can access their dependencies' results through the context object, and all tasks have access to the initial context (when set) under `ctx.initial`.

## Logging

Clujo supports custom logging through a logger interface. The logger can be provided to the Clujo instance to capture various events and errors during execution. Each log level is optional, and you can choose to implement only the methods you need.

```typescript
// Define a logger that implements the ClujoLogger interface
interface ClujoLogger {
    debug?: (message: string): void;
    log?: (message: string): void;
    error?: (message: string): void;
}

// Example implementation using console
const consoleLogger = {
    log: (message) => console.log(`[Clujo] ${message}`),
    debug: (message) => console.debug(`[Clujo] ${message}`),
    error: (message) => console.error(`[Clujo] ${message}`)
};

// Or a custom logger
const customLogger = {
    log: (message) => myLoggingService.info(message),
    debug: (message) => myLoggingService.debug(message),
    error: (message) => myLoggingService.error(message)
};

// Provide the logger to Clujo
const clujo = new Clujo({
    id: "myClujoJob",
    taskGraphRunner: tasks,
    cron: { pattern: "*/5 * * * *" },
    logger: customLogger
});
```

The logger will capture various events such as:
- Task execution failures
- Distributed lock acquisition and release events
- Disabled execution attempts

If no logger is provided, Clujo will operate silently without logging any events.

## Using Redis for Distributed Locking

When an `ioredis` client is provided, Clujo will use it to acquire a lock for each task execution. This ensures that tasks are not executed concurrently in a distributed environment.

```typescript
import Redis from 'ioredis';

const client = new Redis();

new Clujo({
  id: "myClujoJob",
  cron: { pattern: "*/5 * * * * *" },
  taskGraphRunner: tasks,
  redis: {
      client,
      lockOptions: { /* optional redis-semaphore lock options */ }
  },
});
```

## Running Tasks on Startup

You can run tasks immediately when the job starts by setting the `runOnStartup` option to `true`.
The triggered execution will prevent a scheduled execution from running at the same time in the event
the scheduled execution overlaps with the triggered execution.

```typescript
new Clujo({
  id: "myClujoJob",
  cron: { pattern: "*/5 * * * * *" },
  taskGraphRunner: tasks,
  runOnStartup: true,
});
```

## Error Handling

Tasks can have their own error handlers, allowing you to define custom logic for handling failures. The function can be synchronous or asynchronous, and has access to the same context as the execute function.

```typescript
.addTask({
  id: "taskWithErrorHandler",
  execute: async ({ deps, ctx }) => {
    // Task logic
  },
  errorHandler: async (error, { deps, ctx }) => {
    console.error("Task failed:", error);
  }
})
```

Another way to monitor / act on errors is to make use of the `onTasksCompleted` hook in the `TaskGraph.build` call, i.e.,

```typescript
new TaskGraph()
    .addTask({
        id: "task",
        execute: async ({ deps, ctx }) => {...}
    })
    .build({
        onTasksCompleted: (ctx, deps, errors) => {
            for (const error of errors) {
                console.error(`${error.id} failed: ${error.message}`)
            }
        },
    });
```

## Retry Policy

Specify a retry policy for a task to automatically retry failed executions. The task will be retried up to `maxRetries` times, with a delay of `retryDelayMs` between each retry.

```typescript
.addTask({
  id: "taskWithRetry",
  execute: async ({ deps, ctx }) => {
    // Task logic
  },
  retryPolicy: { maxRetries: 3, retryDelayMs: 1000 }
})
```

# Using the Scheduler

The Scheduler class provides a convenient way to manage multiple Clujo jobs together. It allows you to add, start, and stop groups of jobs in a centralized manner.
It is not required and `Clujo`'s can be managed manually if desired.

## Adding Jobs to the Scheduler

```typescript
import { Scheduler } from '@ramplex/clujo';
import { Redis } from 'ioredis';

const scheduler = new Scheduler();

// Add jobs to the scheduler
scheduler.addJob(myFirstClujo);
scheduler.addJob(mySecondClujo);

// Add more jobs as needed
```

## Starting All Jobs

You can start all added jobs at once, optionally providing a Redis instance for distributed locking:

```typescript
// Start all jobs
scheduler.start();
```

## Stopping All Jobs

To stop all running jobs:

```typescript
// Stop all jobs with a default timeout of 5000ms
await scheduler.stop();

// Or, specify a custom timeout in milliseconds
await scheduler.stop(10000);
```

# Contributing

Contributions are welcome! Please describe the contribution in an issue before submitting a pull request. Attach the issue number to the pull request description and include tests for new features / bug fixes.

# License

Clujo is [MIT](LICENSE) licensed.
