// Runs once when the Next.js server starts (App Router instrumentation
// hook). Used here to kick off the miragold.my gold price auto-sync so the
// shop team only has to update the price once, on their own website
// (sir zul, 19/9). Edge runtime has no persistent process to run an
// interval in, so this only starts under Node.js.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPriceSyncScheduler } = await import("@/lib/priceSync");
    startPriceSyncScheduler();
  }
}
