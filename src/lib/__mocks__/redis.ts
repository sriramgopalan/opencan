import { vi } from "vitest";

export const redis = {
  exists: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  mget: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
};
