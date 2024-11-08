import { Clujo, TaskGraph } from "@ramplex/clujo";

// Learn more at https://docs.deno.com/runtime/manual/examples/module_metadata#concepts
if (import.meta.main) {
    const tasks = new TaskGraph({
        contextFactory: () => 10,
    })
        .addTask({
            id: "task1",
            execute: ({ deps, ctx }) => {
                console.debug("Task 1 executing");
                console.debug("Task 1", deps, ctx);
                console.debug("Task 1 executed");
                return "Task 1 result";
            },
            dependencies: [],
        })
        .addTask({
            id: "task2",
            execute: ({ deps, ctx }) => {
                console.debug("Task 2 executing");
                console.log("Task 2", deps, ctx);
                console.debug("Task 2 executed");
                return "Task 2 result";
            },
            dependencies: [],
        })
        .addTask({
            id: "task3",
            execute: ({ deps, ctx }) => {
                console.debug("Task 3 executing");
                console.log("Task 3", deps, ctx);
                console.debug("Task 3 executed");
                return "Task 3 result";
            },
            dependencies: ["task2"],
        })
        .addTask({
            id: "task4",
            execute: ({ deps, ctx }) => {
                console.debug("Task 4 executing");
                console.log("Task 4", deps, ctx);
                console.debug("Task 4 executed");
                return "Task 4 result";
            },
            dependencies: ["task1"],
        })
        .build({
            onTasksCompleted: (ctx) => {
                console.log("All tasks completed callback", ctx);
            },
        });

    const clujo = new Clujo({
        id: "test",
        cron: {
            // every 10 seconds cron pattern
            pattern: "*/10 * * * * *",
        },
        taskGraphRunner: tasks,
        runOnStartup: false,
    });

    // Immediate trigger
    clujo.trigger().then((value) => {
        console.log("Trigger result", value);
    });

    // start cron
    clujo.start();
}
