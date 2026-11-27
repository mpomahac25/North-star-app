import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const daoMocks = {
  findByProviderSubject: jest.fn(),
  findByEmail: jest.fn(),
  createOAuthUser: jest.fn(),
  updateOAuthProfile: jest.fn(),
  linkOAuthAccount: jest.fn(),
  saveEmailVerificationToken: jest.fn(),
  issueEmailVerificationToken: jest.fn(),
  verifyEmailToken: jest.fn(),
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
    updateOAuthProfile: daoMocks.updateOAuthProfile,
    linkOAuthAccount: daoMocks.linkOAuthAccount,
    saveEmailVerificationToken: daoMocks.saveEmailVerificationToken,
    issueEmailVerificationToken: daoMocks.issueEmailVerificationToken,
    verifyEmailToken: daoMocks.verifyEmailToken,
  }),
}));
jest.unstable_mockModule("../../dao/auth/sessionReadDao.js", () => ({
  createSessionReadDao: () => ({
    findUserByTokenHash: daoMocks.findUserByTokenHash,
  }),
}));
jest.unstable_mockModule("../../dao/auth/sessionWriteDao.js", () => ({
  createSessionWriteDao: () => ({
    create: daoMocks.createSession,
    deleteByTokenHash: daoMocks.deleteByTokenHash,
  }),
}));

const { createAuthPersistenceService } =
  await import("../../services/authPersistenceService.js");

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
    await expect(
      service.findOrCreateGoogleUser({
        subject: "google-sub",
        email: user.email,
      }),
    ).resolves.toBe(user);
    expect(daoMocks.findByEmail).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });

  test("rejects a Google identity matching an existing account email", async () => {
    const user = { id: 8, username: "existing", email: "person@example.test" };
    daoMocks.findByProviderSubject.mockResolvedValue(null);
    daoMocks.findByEmail.mockResolvedValue(user);
    await expect(
      service.findOrCreateGoogleUser({ subject: "sub-2", email: user.email }),
    ).rejects.toMatchObject({
      message:
        "An account already uses this email. Sign in to that account first.",
      status: 409,
    });
    expect(daoMocks.createOAuthUser).not.toHaveBeenCalled();
    expect(daoMocks.linkOAuthAccount).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalled();
  });

  test("updates the stored Google display name for a known identity", async () => {
    const user = { id: 7, email: "user@example.test" };
    const updatedUser = { ...user, displayName: "Rio Viewer" };
    daoMocks.findByProviderSubject
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(updatedUser);

    await expect(
      service.findOrCreateGoogleUser({
        subject: "google-sub",
        email: user.email,
        displayName: "Rio Viewer",
      }),
    ).resolves.toBe(updatedUser);

    expect(daoMocks.updateOAuthProfile).toHaveBeenCalledWith({
      userId: user.id,
      displayName: "Rio Viewer",
    });
  });

  test("delegates email verification token operations", async () => {
    daoMocks.saveEmailVerificationToken.mockResolvedValue({
      id: 12,
      email: "user@example.test",
    });
    daoMocks.issueEmailVerificationToken.mockResolvedValue(null);
    daoMocks.verifyEmailToken.mockResolvedValue({ id: 12 });
    const token = "a".repeat(64);
    const tokenHash = (await import("node:crypto"))
      .createHash("sha256")
      .update(token)
      .digest("hex");
    const expiresAt = new Date(Date.now() + 60_000);

    await expect(
      service.saveEmailVerificationToken({
        userId: 12,
        tokenHash,
        expiresAt,
      }),
    ).resolves.toMatchObject({ id: 12 });
    await expect(
      service.issueEmailVerificationToken({
        email: "user@example.test",
        tokenHash,
        expiresAt,
      }),
    ).resolves.toBeNull();
    await expect(service.verifyEmailToken(tokenHash)).resolves.toEqual({
      id: 12,
    });

    expect(daoMocks.saveEmailVerificationToken).toHaveBeenCalledWith({
      userId: 12,
      tokenHash,
      expiresAt,
    });
    expect(daoMocks.verifyEmailToken).toHaveBeenCalledWith(tokenHash);
  });

  test("rolls back failed user creation and always releases its connection", async () => {
    const error = new Error("database unavailable");
    daoMocks.findByProviderSubject.mockResolvedValue(null);
    daoMocks.findByEmail.mockResolvedValue(null);
    daoMocks.createOAuthUser.mockRejectedValue(error);
    await expect(
      service.findOrCreateGoogleUser({
        subject: "sub-3",
        email: "new@example.test",
      }),
    ).rejects.toBe(error);
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalled();
  });

  test("stores only a hash of the generated session token", async () => {
    daoMocks.createSession.mockResolvedValue(undefined);
    const session = await service.createSession({ userId: 9 });
    expect(session.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(daoMocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 9,
        tokenHash: expect.not.stringMatching(session.token),
        expiresInSeconds: 1209600,
      }),
    );
    expect(daoMocks.createSession.mock.calls[0][0].tokenHash).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  test("hashes tokens before session lookup and revocation", async () => {
    daoMocks.findUserByTokenHash.mockResolvedValue({ id: 11 });
    daoMocks.deleteByTokenHash.mockResolvedValue(undefined);
    const token = "opaque-session-token";
    await expect(service.findSession(token)).resolves.toEqual({ id: 11 });
    await service.revokeSession(token);
    const expectedHash = (await import("node:crypto"))
      .createHash("sha256")
      .update(token)
      .digest("hex");
    expect(daoMocks.findUserByTokenHash).toHaveBeenCalledWith(expectedHash);
    expect(daoMocks.deleteByTokenHash).toHaveBeenCalledWith(expectedHash);
  });
});
