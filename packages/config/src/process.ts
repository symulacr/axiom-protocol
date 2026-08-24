export function registerProcessHandlers(): void {
  // console.error in fatal handlers is the sanctioned channel before exit(1).
  const fatal = (msg: string, error: unknown): void => {
    console.error(
      JSON.stringify({
        level: "error",
        msg,
        error,
        pid: process.pid,
      }),
    );
    process.exit(1);
  };

  process.on("unhandledRejection", (reason: unknown) => {
    fatal(
      "unhandledRejection",
      reason instanceof Error
        ? (reason.stack ?? reason.message)
        : String(reason),
    );
  });

  process.on("uncaughtException", (err: Error) => {
    fatal("uncaughtException", err.stack ?? err.message);
  });
}
