/** @type {import('dependency-cruiser').IConfiguration} */

// Test code and Prisma mocks are allowed to reach the DB client directly.
const TEST_PATHS = ["\\.test\\.tsx?$", "^src/tests/", "/__mocks__/"];

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies must be resolved before merging.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-db-client-outside-repositories",
      severity: "error",
      comment:
        "ADR-003: the Prisma client singleton (src/server/db.ts) is imported only by " +
        "src/server/repositories/. Exception: src/auth.ts, which must hand the client " +
        "to NextAuth's PrismaAdapter.",
      from: {
        path: "^src/",
        pathNot: ["^src/server/repositories/", "^src/auth\\.ts$", ...TEST_PATHS],
      },
      to: { path: "^src/server/db\\.ts$" },
    },
    {
      name: "no-prisma-runtime-outside-repositories",
      severity: "error",
      comment:
        "ADR-003: outside src/server/repositories/, @prisma/client may only be imported " +
        "with `import type` (enums and model types). Runtime Prisma usage lives in repositories.",
      from: {
        path: "^src/",
        pathNot: ["^src/server/repositories/", "^src/server/db\\.ts$", ...TEST_PATHS],
      },
      to: {
        path: "node_modules/(@prisma|\\.prisma)/client",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "no-server-imports-ui",
      severity: "error",
      comment: "Server modules (routers, repositories) must not import app/ or components/ code.",
      from: { path: "^src/server/" },
      to: { path: "^src/(app|components)/" },
    },
    {
      name: "no-components-import-server",
      severity: "error",
      comment:
        "ADR-001: components receive data as props or via tRPC hooks; they never import " +
        "repositories, routers, or the DB client (that would bundle server code client-side).",
      from: { path: "^src/components/" },
      to: { path: "^src/server/" },
    },
    {
      name: "no-flags-in-components",
      severity: "error",
      comment:
        "ADR-005: flags are evaluated server-side only; components receive the evaluated boolean as a prop.",
      from: { path: "^src/components/" },
      to: { path: "^src/lib/flags\\.ts$" },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    tsConfig: {
      fileName: "tsconfig.json",
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
  },
};
