import { Router, type IRouter } from "express";
import { db, directoryTable, institutionRequestsTable } from "@workspace/db";
import { and, asc, eq, ilike } from "drizzle-orm";
import { GetDirectoryQueryParams, GetDirectoryResponse, RequestInstitutionBody, RequestInstitutionResponse } from "@workspace/api-zod";
import { account } from "../lib/auth";
import { HttpError } from "../lib/errors";
import { safeLink } from "../lib/validation";

const router: IRouter = Router();
router.get("/directory", async (req, res): Promise<void> => {
  const params = GetDirectoryQueryParams.parse(req.query);
  const rows = await db.select().from(directoryTable).where(and(
    eq(directoryTable.active, true),
    params.kind ? eq(directoryTable.kind, params.kind) : undefined,
    params.parentId ? eq(directoryTable.parentId, params.parentId) : undefined,
    params.q ? ilike(directoryTable.name, `%${params.q.slice(0, 200)}%`) : undefined,
  )).orderBy(asc(directoryTable.name)).limit(1000);
  res.json(GetDirectoryResponse.parse(rows));
});
router.post("/directory/requests", async (req, res): Promise<void> => {
  const user = await account(req);
  const body = RequestInstitutionBody.parse(req.body);
  if (body.sourceUrl && !safeLink(body.sourceUrl)) throw new HttpError(400, "Provide an http or https source URL.");
  if (body.parentId) {
    const [parent] = await db.select().from(directoryTable).where(eq(directoryTable.id, body.parentId));
    const expected = { university: "country", faculty: "university", department: "faculty", country: "" }[body.kind];
    if (!parent || parent.kind !== expected) throw new HttpError(400, "Select a valid parent for this request.");
  }
  await db.insert(institutionRequestsTable).values({ ...body, name: body.name.trim(), userId: user.id });
  res.status(201).json(RequestInstitutionResponse.parse({ message: "Request submitted. An administrator will verify the source before adding it to the directory." }));
});
export default router;
