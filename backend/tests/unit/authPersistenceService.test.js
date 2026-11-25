import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const daoMocks = {
  findByProviderSubject: jest.fn(),
  findByEmail: jest.fn(),
  createOAuthUser: jest.fn(),
  linkOAuthAccount: jest.fn(),
  createSession: jest.fn(),
  findUserByTokenHash: jest.fn(),
  deleteByTokenHash: jest.fn(),
};

jest.unstable_mockModule("../../dao/auth/userReadDao.js", () => ({
  createUserReadDao: () => ({
    findByProviderSubject: daoMocks.findByProviderSubject,
    findByEmail: daoMocks.findByEmail,
  }),
}));
jest.unstable_mockModule("../../dao/auth/userWriteDao.js", () => ({
  createUserWriteDao: () => ({
    createOAuthUser: daoMocks.createOAuthUser,
    linkOAuthAccount: daoMocks.linkOAuthAccount,
  }),
}));
jest.unstable_mockModule("../../dao/auth/sessionReadDao.js", () => ({
  createSessionReadDao: () => ({ findUserByTokenHash: daoMocks.findUserByTokenHash }),
}));
jest.unstable_mockModule("../../dao/auth/sessionWriteDao.js", () => ({
  createSessionWriteDao: () => ({
    create: daoMocks.createSession,
    deleteByTokenHash: daoMocks.deleteByTokenHash,
  }),
}));

const { createAuthPersistenceService } = await import("../../services/authPersistenceService.js");

describe("auth persistence service", () => {
  let pool;
  let client;
  let service;

  beforeEach(() => {
    for (const mock of Object.values(daoMocks)) mock.mockReset();
    client = { query: jest.fn().mockResolvedValue({}), release: jest.fn() };
    pool = { connect: jest.fn().mockResolvedValue(client) };
    service = createAuthPersistenceService(pool);
  });

  test("reuses an existing Google identity and commits the transaction", async () => {
    const user = { id: 7, email: "user@example.test" };
    daoMocks.findByProviderSubject.mockResolvedValue(user);
    await expect(service.findOrCreateGoogleUser({ subject: "google-sub", email: user.email }))
      .resolves.toBe(user);
    expect(daoMocks.findByEmail).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });

  test("links a new Google identity to a matching existing email", async () => {
    const user = { id: 8, username: "existing", email: "person@example.test" };
    daoMocks.findByProviderSubject.mockResolvedValue(null);
    daoMocks.findByEmail.mockResolvedValue(user);
    daoMocks.linkOAuthAccount.mockResolvedValue(undefined);
    await expect(service.findOrCreateGoogleUser({ subject: "sub-2", email: user.email }))
      .resolves.toBe(user);
    expect(daoMocks.createOAuthUser).not.toHaveBeenCalled();
    expect(daoMocks.linkOAuthAccount).toHaveBeenCalledWith({
      userId: user.id, provider: "google", subject: "sub-2", email: user.email,
    });
    expect(client.query).toHaveBeenCalledWith("COMMIT");
  });

  test("rolls back failed user creation and always releases its connection", async () => {
    const error = new Error("database unavailable");
    daoMocks.findByProviderSubject.mockResolvedValue(null);
    daoMocks.findByEmail.mockResolvedValue(null);
    daoMocks.createOAuthUser.mockRejectedValue(error);
    await expect(service.findOrCreateGoogleUser({ subject: "sub-3", email: "new@example.test" }))
      .rejects.toBe(error);
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalled();
  });

  test("stores only a hash of the generated session token", async () => {
    daoMocks.createSession.mockResolvedValue(undefined);
    const session = await service.createSession({ userId: 9 });
    expect(session.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(daoMocks.createSession).toHaveBeenCalledWith(expect.objectContaining({
      userId: 9,
      tokenHash: expect.not.stringMatching(session.token),
      expiresInSeconds: 1209600,
    }));
    expect(daoMocks.createSession.mock.calls[0][0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("hashes tokens before session lookup and revocation", async () => {
    daoMocks.findUserByTokenHash.mockResolvedValue({ id: 11 });
    daoMocks.deleteByTokenHash.mockResolvedValue(undefined);
    const token = "opaque-session-token";
    await expect(service.findSession(token)).resolves.toEqual({ id: 11 });
    await service.revokeSession(token);
    const expectedHash = (await import("node:crypto")).createHash("sha256").update(token).digest("hex");
    expect(daoMocks.findUserByTokenHash).toHaveBeenCalledWith(expectedHash);
    expect(daoMocks.deleteByTokenHash).toHaveBeenCalledWith(expectedHash);
  });
});
