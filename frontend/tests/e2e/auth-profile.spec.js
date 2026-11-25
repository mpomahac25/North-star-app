import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const requireBackend = createRequire(
  new URL("../../../backend/package.json", import.meta.url),
);
const { Client } = requireBackend("pg");

let createdEmail;

test.beforeEach(async ({ page }) => {
  createdEmail = undefined;
  await page.setViewportSize({ width: 1280, height: 800 });
});

test.afterEach(async () => {
  if (!createdEmail) return;

  const client = new Client({
    host: process.env.E2E_DB_HOST || "127.0.0.1",
    port: Number(process.env.E2E_DB_PORT || 5432),
    database: process.env.E2E_DB_NAME,
    user: process.env.E2E_DB_USER,
    password: process.env.E2E_DB_PASSWORD,
  });

  try {
    await client.connect();
    await client.query("DELETE FROM users WHERE email = $1", [createdEmail]);
  } finally {
    await client.end();
  }
});

test("shows signed-out controls using the real authentication API", async ({
  page,
}) => {
  await page.goto("/");

  const header = page.locator(".top-nav-right");
  const signIn = header.getByRole("link", { name: "Sign in" });
  await expect(signIn).toBeVisible();
  await expect(signIn).toHaveAttribute("href", "/login");
  await expect(page.locator(".desktop-greeting")).toHaveCount(0);
});

test("registers, restores a session, confirms sign-out, and logs in again", async ({
  page,
}) => {
  const id = randomUUID().replaceAll("-", "").slice(0, 20);
  const username = `e2e_${id}`;
  createdEmail = `${username}@example.test`;

  await page.goto("/register");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(createdEmail);
  await page.getByLabel("Password").fill("E2e-test-password-1");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL("/");
  const header = page.locator(".top-nav-right");
  await expect(header.getByText(username, { exact: true })).toBeVisible();
  await expect(page.locator(".desktop-greeting .username")).toHaveText(
    username,
  );

  await page.reload();
  await expect(header.getByText(username, { exact: true })).toBeVisible();

  await header.getByRole("button", { name: "Sign out" }).click();
  const dialog = page.getByRole("dialog", { name: "Sign out?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(header.getByText(username, { exact: true })).toBeVisible();

  await header.getByRole("button", { name: "Sign out" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign out" })
    .click();
  await expect(header.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.locator(".desktop-greeting")).toHaveCount(0);

  await page.goto("/login");
  await page.getByLabel("Username or email").fill(createdEmail);
  await page.getByLabel("Password").fill("E2e-test-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
  await expect(header.getByText(username, { exact: true })).toBeVisible();
});

test("shows the real invalid-credentials response and both manual auth forms", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Sign in to Rio" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue with Google" }),
  ).toHaveAttribute("href", "/api/auth/google");

  await page.getByLabel("Username or email").fill(`missing_${randomUUID()}`);
  await page.getByLabel("Password").fill("Wrong-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Invalid username/email or password.",
  );

  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL("/register");
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
