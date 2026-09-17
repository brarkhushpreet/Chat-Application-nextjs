import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Generation does not need a live database. Runtime commands should set DATABASE_URL.
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgresql://localhost:5432/nexus_chat",
  },
});
