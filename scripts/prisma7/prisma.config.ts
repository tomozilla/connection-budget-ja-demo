import { defineConfig } from "prisma/config"
// Only used by `prisma generate`. The test itself passes the connection string to the pg adapter.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: "postgresql://r3:postgres@127.0.0.1:54322/postgres" }, // local CLI database only
})
