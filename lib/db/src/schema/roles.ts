import { pgRole } from "drizzle-orm/pg-core";

// Provisioned, without login or bypass privileges, by the reviewed SQL migration.
export const socialRole = pgRole("campus_core_social").existing();
