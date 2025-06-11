import { Clujo } from "@ramplex/clujo";

// Learn more at https://docs.deno.com/runtime/manual/examples/module_metadata#concepts
if (import.meta.main) {
    // Example 1: Simple counter
    let counter = 0;
    const counterRunner = {
        trigger: async () => {
            counter++;
            console.log(`Counter is now: ${counter}`);
            return { count: counter, timestamp: new Date() };
        }
    };

    // Example 2: File system cleanup (Deno-specific)
    const cleanupRunner = {
        trigger: async () => {
            console.log("Starting cleanup...");
            
            // Example: Clean up temp files older than 1 hour
            const tempDir = await Deno.makeTempDir();
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            let cleaned = 0;
            
            try {
                for await (const entry of Deno.readDir(tempDir)) {
                    const path = `${tempDir}/${entry.name}`;
                    const stat = await Deno.stat(path);
                    
                    if (stat.mtime && stat.mtime.getTime() < oneHourAgo) {
                        await Deno.remove(path);
                        cleaned++;
                    }
                }
            } catch (err) {
                console.error("Cleanup error:", err);
            }
            
            console.log(`Cleaned up ${cleaned} old files`);
            return { cleaned, directory: tempDir, timestamp: new Date() };
        }
    };

    // Create Clujo instances
    const counterClujo = new Clujo({
        id: "counter-job",
        cron: {
            // every 10 seconds
            pattern: "*/10 * * * * *",
        },
        runner: counterRunner,
        runOnStartup: true,
        logger: {
            log: (msg) => console.log(`[Counter] ${msg}`),
            debug: (msg) => console.debug(`[Counter] ${msg}`),
            error: (msg) => console.error(`[Counter] ${msg}`),
        }
    });

    const cleanupClujo = new Clujo({
        id: "cleanup-job",
        cron: {
            // every minute
            pattern: "0 * * * * *",
        },
        runner: cleanupRunner,
        runOnStartup: false,
    });

    // Start the jobs
    counterClujo.start();
    cleanupClujo.start();

    // Manual trigger example
    cleanupClujo.trigger().then((value) => {
        console.log("Manual cleanup result:", value);
    });

    // Set up graceful shutdown
    const shutdown = async () => {
        console.log("\nShutting down...");
        await counterClujo.stop();
        await cleanupClujo.stop();
        console.log("All jobs stopped.");
        Deno.exit(0);
    };

    // Listen for shutdown signals
    Deno.addSignalListener("SIGINT", shutdown);
    Deno.addSignalListener("SIGTERM", shutdown);

    console.log("Clujo examples running. Press Ctrl+C to stop.");
}
