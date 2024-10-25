# Table of Contents

- [clujo](#clujo)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Advanced Usage](#advanced-usage)
  - [Understanding Dependency Execution](#understanding-dependency-execution)
    - [Context object](#context-object)
    - [Task execution](#task-execution)
  - [Setting Context and Dependencies](#setting-context-and-dependencies)
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

# clujo

Clujo is a flexible solution for managing scheduled tasks in your distributed Node.js / Deno applications. It would not be possible without the amazing work of the following projects:

- [Croner](https://github.com/Hexagon/croner/tree/master?tab=readme-ov-file): used for running task graphs on a cron schedule
- [ioredis](https://github.com/redis/ioredis) - (not a dependency, but the supported redis client) used to ensure single execution in a distributed environment
- [redis-semaphore](https://github.com/swarthy/redis-semaphore) (only used if an `ioredis` instance is provided to start method) - used to ensure single execution in a distributed environment

Coming soon: bun support.

## Features

- Clujo provides an intuitive interface for setting up cron-like schedules, making it easy to create and manage recurring tasks.
- Clujo's task orchestration allows you to define and execute a set of interdependent tasks, running independent tasks in parallel when possible while ensuring dependent tasks wait for their prerequisites.
- Clujo's context system allows you to pass and modify state between tasks, enabling sophisticated data flow and making it easier to build complex, stateful workflows.
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
npm install clujo
yarn add clujo
pnpm install clujo
```

## jsr registry

### deno

deno add jsr:@ramplex/clujo

### npm (one of the below, depending on your package manager)
npx jsr add @ramplex/clujo
yarn dlx jsr add @ramplex/clujo
pnpm dlx jsr add @ramplex/clujo
bunx jsr add @ramplex/clujo

Here's a simple example to get you started with Clujo:

```typescript
import { TaskGraph, Clujo } from 'clujo';

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
    // since task3 has no dependencies, it will run in parallel with task1 at the start of execution
  })
  .build();

// Create a Clujo instance
const clujo = new Clujo({
  id: "myClujoJob",
  cron: {
    pattern: "*/5 * * * * *",
  },
  taskGraphRunner: tasks,
});

// Start the job
clujo.start({
  // Optional: provide an ioredis client for distributed locking
  redis: { client: new Redis() },
  // Optional: run the job immediately on startup
  runOnStartup: true,
  // Optional: provide a callback to run when the job completes that takes in the completed context object
  onTaskCompletion: (ctx) => console.log(ctx),
});

// Trigger the job manually to get a complete context object
const completedContext = await clujo.trigger();

// Gracefully stop the job by waiting until the current execution completes
// Will force stop after timeout milliseconds
await clujo.stop(timeoutMs);
```

In the event a Javascript `Date` object is provided instead of a cron pattern, the task graph
will be executed precisely once at the specific date/time specified. Time is in ISO 8601 local time.

# Advanced Usage

## Understanding Dependency Execution

### Context object

The context object contains the appropriate context for the task.

 - All tasks have access to a context object which allows sharing values between tasks
 - If task `i` depends on tasks `j_1,...,j_n`, then it can be guaranteed the context object will have the result of tasks `j_1,...,j_n` under the keys `j_1,...,j_n`. The value at these keys is the return of task `j_i`, `i = 1,...,n`.
 - If a task has no dependencies it has access to the initial context object only (if it was set).

### Task execution

  - case: N tasks each with no dependencies. All tasks run concurrently
  - case: N tasks where task i depends on task `i-1`, `i=1,...,N`. All tasks run sequentially
  - case: Fix `1 <= i != j <= N`. N tasks where task `i` depends on task `j`. `N\{i}` tasks run concurrently, task `i` runs after task `j`.
  - case: Task `i` depends on task `j`, task `j` depends on task `i`. Cyclic dependencies will result in an error pre-execution.

In the event a task execution fails, all further dependent tasks will not be executed. Other independent tasks will continue to run.

Can build up more complex cases from these simple cases


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

// Using an (sync or async) context factory
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
Tasks can access their dependencies' results through the context object, and all tasks have access to the initial context under `ctx.initial`.

## Using Redis for Distributed Locking

When an `ioredis` client is provided, Clujo will use it to acquire a lock for each task execution. This ensures that tasks are not executed concurrently in a distributed environment.

```typescript
import Redis from 'ioredis';

const redis = new Redis();

clujo.start({
  redis: {
    client: redis,
    lockOptions: { /* optional lock options */ }
  }
});
```

## Running Tasks on Startup

You can run tasks immediately when the job starts by setting the `runOnStartup` option to `true`.
The triggered execution will prevent a scheduled execution from running at the same time in the event
the scheduled execution overlaps with the triggered execution.

```typescript
clujo.start({
  runOnStartup: true
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

## Adding Jobs to the Scheduler

```typescript
import { Scheduler } from 'clujo';
import { Redis } from 'ioredis';

const scheduler = new Scheduler();

// Add jobs to the scheduler
scheduler.addJob({
  job: myFirstClujoJob,
  // Optional completion handler for this clujo
  completionHandler: async (ctx) => {
    console.log('First job completed with context:', ctx);
  }
});

scheduler.addJob({
  job: mySecondClujoJob
});

// Add more jobs as needed
```

## Starting All Jobs

You can start all added jobs at once, optionally providing a Redis instance for distributed locking:

```typescript
const redis = new Redis(); // Your Redis configuration

// Start all jobs without distributed locking
scheduler.start();

// Or, start all jobs with distributed locking
scheduler.start(redis);
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
