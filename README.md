# clujo

Clujo is a flexible solution for managing scheduled tasks in distributed systems. At a glance:

- Clujo provides an intuitive interface for setting up cron-like schedules, making it easy to create and manage recurring tasks.
- Clujo's task orchestration allows you to define and execute a set of interdependent tasks, running independent tasks in parallel when possible while ensuring dependent tasks wait for their prerequisites.
- Clujo's context system allows you to pass and modify state between tasks, enabling sophisticated data flow and making it easier to build complex, stateful workflows.
- Clujo includes a configurable retry policy, enabling your tasks to automatically recover from transient failures without manual intervention.
- When used with Redis, Clujo provides out-of-the-box distributed locking, preventing overlapping executions in a distributed environment.
- Clujo offers type-safe task definitions and context management.
- With the `runOnStartup` feature, Clujo allows you to run tasks immediately when needed, in addition to their scheduled times.
- Clujo provides a graceful way to stop scheduled tasks, ensuring that your application can shut down without leaving tasks in an inconsistent state.
- Each task can have its own error handler, allowing for fine-grained control over how failures are managed and reported.

## Installation

Install Clujo using npm, pnpm, yarn, or your favorite package manager:

```bash
pnpm install clujo
```

or

```bash
npm install clujo
```

or

```bash
yarn add clujo
```

## Quick Start

Here's a simple example to get you started with Clujo:

```typescript
import { TaskGraph, Clujo } from 'clujo';

// Define your tasks
const tasks = new TaskGraph()
  .finalize()
  .addTask({
    id: "task1",
    execute: async ({ deps, ctx }) => {
      console.log("Task 1 executing");
      return "Task 1 result";
    },
  })
  .addTask({
    id: "task2",
    execute: async ({ deps, ctx }) => {
      console.log("Task 2 executing");
      return "Task 2 result";
    },
    // will only execute after task 1 completes
    dependencies: ["task1"],
  })
  .addTask({
    id: "task3",
    execute: async ({ deps, ctx }) => {
      console.log("Task 3 executing");
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
clujo.start();

// Trigger the job manually
clujo.trigger().then((result) => {
  console.log(result);
});

// Stop the job -- will force stop after 5 seconds
await clujo.stop(timoutMs);
```

## Advanced Usage

### Setting Context and Dependencies

```typescript
const tasks = new TaskGraph()
  .setContext(async () => {
    const users = await fetchUsers();
    return { users };
  })
  .setDependencies({ logger: console })
  .finalize()
  // ... add tasks
  .build();
```

### Using Redis for Distributed Locking

When an `ioredis` client is provided, Clujo will use it to acquire distributed locks for each task execution. This ensures that tasks are not executed concurrently in a distributed environment.

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

### Error Handling

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

### Retry Policy

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
