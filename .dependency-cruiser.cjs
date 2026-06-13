/** @type {import('dependency-cruiser').IConfiguration} */
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
      name: "no-client-imports-server",
      severity: "error",
      comment: "Next.js app/ (client boundary) must not import server/ modules directly.",
      from: { path: "^src/app" },
      to:   { path: "^server/" },
    },
    {
      name: "no-server-imports-app",
      severity: "error",
      comment: "Server modules must not import Next.js app/ code.",
      from: { path: "^server/" },
      to:   { path: "^src/app" },
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
