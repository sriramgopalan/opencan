import { vi } from "vitest";

export function makeRedisMock() {
  return {
    exists: vi.fn<() => Promise<number>>().mockResolvedValue(0),
    get: vi.fn<() => Promise<string | null>>(),
    set: vi.fn<() => Promise<string>>(),
    del: vi.fn<() => Promise<number>>(),
    sadd: vi.fn<() => Promise<number>>(),
    srem: vi.fn<() => Promise<number>>(),
    smembers: vi.fn<() => Promise<string[]>>(),
  };
}

export function makeFullRedisMock() {
  const pipelineMock = {
    incr: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn<() => Promise<[Error | null, unknown][]>>(),
  };
  const redisMock = {
    pipeline: vi.fn(() => pipelineMock),
    ...makeRedisMock(),
  };
  return { redisMock, pipelineMock };
}
