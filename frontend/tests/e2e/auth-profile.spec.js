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
    await expect(
      page.getByText(/email and password sign-up is coming/i),
    ).toBeVisible();
  });
});
