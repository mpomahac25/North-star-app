import { test, expect } from "@playwright/test";

const SAMPLE_SESSION = {
    bookingId: 123,
    paymentId: "550e8400-e29b-41d4-a716-446655440000",
    stripeSessionId: "cs_test_a1b2c3d4e5",
    checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4e5",
    status: "pending_payment",
    paymentExpiresAt: "2030-12-01T18:15:00.000Z",
};

test.describe("Stripe Payment & Checkout Flow", () => {
    test("Starts Stripe Checkout session, prevents double submit, and redirects to checkoutUrl", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1280, height: 800 });

        let postCalls = 0;

        await page.route(
            (url) => url.pathname === "/api/payments/checkout-sessions",
            async (route) => {
                postCalls += 1;
                const payload = route.request().postDataJSON();
                expect(payload).toEqual({ bookingId: 123 });

                await new Promise((resolve) => setTimeout(resolve, 250));

                await route.fulfill({
                    status: 201,
                    contentType: "application/json",
                    body: JSON.stringify(SAMPLE_SESSION),
                });
            },
        );

        await page.route("https://checkout.stripe.com/**", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/html",
                body: "<html><body><h1>Stripe Hosted Checkout Mock</h1></body></html>",
            }),
        );

        await page.goto("/checkout?bookingId=123");

        await expect(page.getByRole("heading", { name: "Complete your payment" })).toBeVisible();

        const bookingInput = page.getByLabel("Booking ID");
        await expect(bookingInput).toHaveValue("123");

        const submitButton = page.getByRole("button", {
            name: "Proceed to Stripe Checkout",
        });

        await submitButton.click();

        await expect(page.getByRole("button", { name: "Redirecting to Stripe..." })).toBeDisabled();

        await expect(page).toHaveURL(SAMPLE_SESSION.checkoutUrl);
        expect(postCalls).toBe(1);
    });

    test("Validates booking ID input and displays backend errors on checkout", async ({ page }) => {
        await page.goto("/checkout");

        const submitButton = page.getByRole("button", {
            name: "Proceed to Stripe Checkout",
        });

        await submitButton.click();
        await expect(page.getByRole("alert")).toContainText(
            "Please enter a valid positive numeric Booking ID.",
        );

        await page.route(
            (url) => url.pathname === "/api/payments/checkout-sessions",
            (route) =>
                route.fulfill({
                    status: 404,
                    contentType: "application/json",
                    body: JSON.stringify({
                        error: {
                            code: "BOOKING_NOT_FOUND",
                            message: "Booking #999 was not found.",
                        },
                    }),
                }),
        );

        await page.getByLabel("Booking ID").fill("999");
        await submitButton.click();

        await expect(page.getByRole("alert")).toContainText("Booking #999 was not found.");
        await expect(submitButton).toBeEnabled();
    });

    test("Success page polls backend until webhook marks session paid", async ({ page }) => {
        let isPaid = false;
        let statusChecks = 0;

        await page.route(
            (url) =>
                url.pathname ===
                `/api/payments/checkout-sessions/${SAMPLE_SESSION.stripeSessionId}/status`,
            (route) => {
                statusChecks += 1;
                return route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        ...SAMPLE_SESSION,
                        status: isPaid ? "paid" : "pending_payment",
                    }),
                });
            },
        );

        await page.goto(`/checkout/success?session_id=${SAMPLE_SESSION.stripeSessionId}`);

        await expect(
            page.getByRole("heading", { name: "Verifying your payment..." }),
        ).toBeVisible();
        await expect(page.getByRole("heading", { name: "Booking confirmed" })).toHaveCount(0);

        const checksBeforeWebhook = statusChecks;
        isPaid = true;

        await expect(page.getByRole("heading", { name: "Booking confirmed" })).toBeVisible({
            timeout: 6000,
        });

        expect(statusChecks).toBeGreaterThan(checksBeforeWebhook);
        await expect(page.getByText("#123")).toBeVisible();
        await expect(page.getByText("Paid", { exact: true })).toBeVisible();
        await expect(page.getByText(SAMPLE_SESSION.paymentId)).toBeVisible();
    });

    test("Success page handles missing session_id and failed payment status", async ({ page }) => {
        await page.goto("/checkout/success");

        await expect(page.getByRole("heading", { name: "Missing payment session" })).toBeVisible();
        await expect(page.getByRole("alert")).toContainText(
            "We cannot verify payment without a valid Stripe session identifier.",
        );

        await page.route(
            (url) =>
                url.pathname ===
                `/api/payments/checkout-sessions/${SAMPLE_SESSION.stripeSessionId}/status`,
            (route) =>
                route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        ...SAMPLE_SESSION,
                        status: "failed",
                    }),
                }),
        );

        await page.goto(`/checkout/success?session_id=${SAMPLE_SESSION.stripeSessionId}`);

        await expect(page.getByRole("heading", { name: "Payment not confirmed" })).toBeVisible();

        const retryLink = page.getByRole("link", {
            name: "Return to Checkout",
        });
        await expect(retryLink).toHaveAttribute("href", "/checkout?bookingId=123");
    });

    test("Cancel page preserves booking reference without assuming cancellation and allows retry", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });

        await page.goto("/checkout?bookingId=123");
        await page.evaluate(() => {
            window.sessionStorage.setItem("rio_active_booking_id", "123");
        });

        await page.goto("/checkout/cancel");

        await expect(
            page.getByRole("heading", { name: "Payment was not completed" }),
        ).toBeVisible();
        await expect(page.getByRole("status")).toContainText(
            "Your booking has not been automatically cancelled",
        );
        await expect(page.getByText("#123")).toBeVisible();

        const hasHorizontalScroll = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(hasHorizontalScroll).toBe(false);

        await page.getByRole("link", { name: "Retry Payment" }).click();
        await expect(page).toHaveURL(/\/checkout\?bookingId=123$/);
        await expect(page.getByLabel("Booking ID")).toHaveValue("123");
    });
});
