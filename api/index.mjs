// The build bundles workspace TypeScript before Vercel traces this function.
// Do not import src/index.ts: it binds a port and starts a persistent timer.
export { default } from "../artifacts/api-server/dist/vercel.mjs";

// Express must receive the untouched stream, particularly for Paystack HMACs
// and Clerk's proxy. Never parse/re-serialize the request in this adapter.
// NOTE: `config.api.bodyParser` is a Next.js convention; Vercel does not document
// it for plain Node functions, so it is kept only as a harmless marker (the local
// smoke test asserts it). Raw-body integrity on Vercel's own runtime is NOT proven
// by local tests: confirm it in a hosted Preview (see docs/VERCEL-DEPLOYMENT.md).
export const config = { api: { bodyParser: false } };
