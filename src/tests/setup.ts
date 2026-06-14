import { config } from "dotenv";
import { afterAll, afterEach, beforeAll } from "vitest";

import { server } from "./msw/server";

config({ path: ".env.test" });

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
