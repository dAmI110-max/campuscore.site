import { Router, type IRouter } from "express";
import { db, profilesTable, directoryTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CheckUsernameQueryParams, CheckUsernameResponse, GetProfileResponse, SaveProfileBody, SaveProfileResponse, GetPublicProfileParams, GetPublicProfileResponse } from "@workspace/api-zod";
import { account, identity } from "../lib/auth";
import { academicEntry, normalizeUsername, ownedImages, usernameError } from "../lib/validation";
import { HttpError } from "../lib/errors";

const router: IRouter = Router();
router.get("/usernames/availability", async (req, res): Promise<void> => {
  const input = CheckUsernameQueryParams.parse(req.query);
  const username = normalizeUsername(input.username);
  let reason = usernameError(username);
  if (!reason) {
    const [row] = await db.select({ id: profilesTable.id }).from(profilesTable).where(eq(profilesTable.username, username));
    if (row && row.id !== identity(req)) reason = "This username is already taken.";
  }
  res.json(CheckUsernameResponse.parse({ username, available: !reason, reason }));
});
router.get("/profile", async (req, res): Promise<void> => {
  const user = await account(req);
  res.json(GetProfileResponse.parse({ ...user, complete: !!user.username && !!user.universityId }));
});
router.put("/profile", async (req, res): Promise<void> => {
  const user = await account(req);
  const body = SaveProfileBody.parse(req.body);
  const username = normalizeUsername(body.username);
  const issue = usernameError(username);
  if (issue) throw new HttpError(400, issue);
  const displayName = body.displayName.trim();
  if (displayName.length < 2) throw new HttpError(400, "Enter your display name.");
  await academicEntry(body.countryId, "country");
  await academicEntry(body.universityId, "university", body.countryId);
  if (body.facultyId !== null) await academicEntry(body.facultyId, "faculty", body.universityId);
  if (body.departmentId !== null) {
    if (!body.facultyId) throw new HttpError(400, "Select a faculty before a department.");
    await academicEntry(body.departmentId, "department", body.facultyId);
  }
  if (body.avatarPath) await ownedImages([body.avatarPath], user.id);
  const [saved] = await db.update(profilesTable).set({
    ...body, displayName, username, updatedAt: new Date(),
  }).where(eq(profilesTable.id, user.id)).returning();
  res.json(SaveProfileResponse.parse({ ...saved, complete: true }));
});
router.get("/profiles/:username", async (req, res): Promise<void> => {
  const { username } = GetPublicProfileParams.parse(req.params);
  const [user] = await db.select().from(profilesTable).where(eq(profilesTable.username, normalizeUsername(username)));
  if (!user || user.suspended) throw new HttpError(404, "Profile not found.");
  let universityName: string | null = null;
  if (user.showAcademics && user.universityId) {
    const [entry] = await db.select().from(directoryTable).where(eq(directoryTable.id, user.universityId));
    universityName = entry?.name ?? null;
  }
  res.json(GetPublicProfileResponse.parse({
    displayName: user.displayName, username: user.username, bio: user.bio, avatarPath: user.avatarPath, universityName,
  }));
});
export default router;
