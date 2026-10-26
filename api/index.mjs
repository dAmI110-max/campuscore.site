// The build bundles workspace TypeScript before Vercel traces this function.
// Do not import src/index.ts: it binds a port and starts a persistent timer.
export { default } from "../artifacts/api-server/dist/vercel.mjs";

// Express must receive the untouched stream, particularly for Paystack HMACs
// and Clerk's proxy. Never parse/re-serialize the request in this adapter.
export const config = { api: { bodyParser: false } };
