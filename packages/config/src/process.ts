export function registerProcessHandlers(): void {
  process.on("unhandledRejection", (reason: unknown) => {
    const err =
      reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
    console.error(
      JSON.stringify({
        level: "error",
        msg: "unhandledRejection",
        error: err,
        pid: process.pid,
      }),
    );
    process.exit(1);
  });

  process.on("uncaughtException", (err: Error) => {
    const errMsg = err.stack ?? err.message;
    console.error(
      JSON.stringify({
        level: "error",
        msg: "uncaughtException",
        error: errMsg,
        pid: process.pid,
      }),
    );
    process.exit(1);
  });
}
