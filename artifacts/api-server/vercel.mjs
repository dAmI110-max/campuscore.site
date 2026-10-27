// The service build resolves workspace TypeScript before Vercel traces this
// entry. Never import src/index.ts: it binds a port and starts a timer.
export { default } from "./dist/vercel.mjs";

// Keep Express's stream untouched for webhook HMACs and the Clerk proxy.
export const config = { api: { bodyParser: false } };
