import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test.describe("Header authentication controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test("shows Google sign-in when the visitor is signed out", async ({
    page,
  }) => {
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Authentication required." }),
      }),
    );
    await page.route("**/api/movies", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0, page: 1, limit: 10 }),
      }),
    );

    await page.goto("/");

    const header = page.locator(".top-nav-right");
    const signIn = header.getByRole("link", { name: "Sign in" });
    await expect(signIn).toBeVisible();
    await expect(signIn).toHaveAttribute("href", "/login");
    await expect(page.locator(".desktop-greeting")).toHaveCount(0);
  });

  test("shows the nickname in the header and welcome greeting, then signs out", async ({
    page,
  }) => {
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: 23,
            username: "google_user",
            email: "viewer@example.test",
          },
        }),
      }),
    );
    await page.route("**/api/auth/logout", (route) =>
      route.fulfill({ status: 204 }),
    );
    await page.route("**/api/movies", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0, page: 1, limit: 10 }),
      }),
    );

    await page.goto("/");

    const header = page.locator(".top-nav-right");
    await expect(header.getByText("viewer", { exact: true })).toBeVisible();
    await expect(page.locator(".desktop-greeting .username")).toHaveText(
      "viewer",
    );
    await header.getByRole("button", { name: "Sign out" }).click();
    const logoutDialog = page.getByRole("dialog", { name: "Sign out?" });
    await expect(logoutDialog).toBeVisible();
    await logoutDialog.getByRole("button", { name: "Sign out" }).click();
    await expect(header.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.locator(".desktop-greeting")).toHaveCount(0);
  });

  test("keeps login and registration as separate routes with Google sign-in", async ({
    page,
  }) => {
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Authentication required." }),
      }),
    );

    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "Sign in to Rio" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Continue with Google" }),
    ).toHaveAttribute("href", "/api/auth/google");
    await page.getByRole("link", { name: "Create an account" }).click();

    await expect(page).toHaveURL(/\/register$/);
    await expect(
      page.getByRole("heading", { name: "Create your account" }),
    ).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Sign up with Google" }),
    ).toHaveAttribute("href", "/api/auth/google");
  });

  test("shows the verification flow and supports requesting another email", async ({
    page,
  }) => {
    let registrationRequestBody;
    let resendRequestBody;
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Authentication required." }),
      }),
    );
    await page.route("**/api/auth/register", (route) => {
      registrationRequestBody = route.request().postDataJSON();
      return route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Check your email for a link to verify your account.",
        }),
      });
    });
    await page.route("**/api/auth/resend-verification", (route) => {
      resendRequestBody = route.request().postDataJSON();
      return route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          message:
            "If the address belongs to an unverified account, a verification email will be sent.",
        }),
      });
    });

    await page.goto("/register");
    await page.getByLabel("Username").fill("email_viewer");
    await page.getByLabel("Email").fill("viewer@example.test");
    await page.getByLabel("Password").fill("RioTestPassword!123");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/verify-email$/);
    await expect(page.getByRole("status")).toContainText("Check your inbox");
    await expect(page.getByLabel("Email")).toHaveCount(0);
    expect(registrationRequestBody).toMatchObject({
      email: "viewer@example.test",
    });
    await page
      .getByRole("button", { name: "Resend verification email" })
      .click();
    expect(resendRequestBody).toEqual({ email: "viewer@example.test" });
    await expect(page.getByRole("status")).toContainText(
      "If the address belongs to an unverified account",
    );
  });

  test("confirms an email using its single-use verification link", async ({
    page,
  }) => {
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Authentication required." }),
      }),
    );
    await page.route("**/api/auth/verify-email", (route) =>
      route.fulfill({ status: 204 }),
    );

    await page.goto(`/verify-email?token=${"a".repeat(64)}`);
    await expect(page.getByLabel("Email")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Resend verification email" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Verify email" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Your email is verified",
    );
  });

  test("requires verification for password registration through the real services", async ({
    page,
  }) => {
    test.skip(
      !process.env.DB_TEST_URL ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.EMAIL_E2E_TO || ""),
      "Set DB_TEST_URL and a deliverable EMAIL_E2E_TO to run the full-stack email scenario.",
    );
    test.setTimeout(30000);

    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const username = `e2e_${suffix}`;
    const [localPart, domain] = process.env.EMAIL_E2E_TO.split("@");
    const email = `${localPart}+${suffix}@${domain}`;
    const password = "RioTestPassword!123";

    await page.goto("/register");
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/verify-email$/);
    await expect(page.getByRole("status")).toContainText("Check your inbox");
    expect(
      (await page.context().cookies()).some(
        (cookie) => cookie.name === "rio_session",
      ),
    ).toBe(false);

    await page.goto("/login");
    await page.getByLabel("Username or email").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "Verify your email address before signing in.",
    );
    await expect(
      page.getByRole("link", { name: "Request a verification email" }),
    ).toBeVisible();
  });
});
