import { test, expect } from "@playwright/test";

test.describe("Admin Dashboard", () => {
    test("Displays sections, navigation tabs, and owner seat #1 rule on desktop and mobile", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto("/admin");

        await expect(page.getByRole("heading", { name: "Rio Cinema dashboard" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "1. Sales Overview" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "2. Movies & Screenings" })).toBeVisible();

        const nav = page.locator(".admin-section-tabs");
        await expect(nav.getByRole("button", { name: "1. Sales Overview" })).toBeVisible();
        await expect(nav.getByRole("button", { name: "2. Movies & Screenings" })).toBeVisible();

        await expect(
            page.getByText(
                "Seat #1 is permanently reserved for the owner in every screening and is not included in seats sold.",
            ),
        ).toBeVisible();

        await page.setViewportSize({ width: 390, height: 844 });

        await expect(page.getByRole("heading", { name: "1. Sales Overview" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "2. Movies & Screenings" })).toBeVisible();

        const hasHorizontalScroll = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(hasHorizontalScroll).toBe(false);
    });

    test("Calculates sales KPIs and filters screenings by location and date", async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto("/admin");

        const kpiCards = page.locator(".admin-kpi-card");
        const revenueCard = kpiCards.first();
        const seatsCard = kpiCards.nth(1);
        const salesTable = page.locator("#sales-overview .admin-table");

        await expect(revenueCard.locator(".admin-kpi-value")).toHaveText("€1,485.00");
        await expect(seatsCard.locator(".admin-kpi-value")).toHaveText("114 seats");
        await expect(salesTable.locator("tbody tr")).toHaveCount(2);

        const locationSelect = page.getByRole("combobox", { name: "Location" });
        const dateSelect = page.getByRole("combobox", { name: "Date" });

        await locationSelect.selectOption("Oulu");
        await expect(revenueCard.locator(".admin-kpi-value")).toHaveText("€884.00");
        await expect(seatsCard.locator(".admin-kpi-value")).toHaveText("68 seats");
        await expect(salesTable.locator("tbody tr")).toHaveCount(1);
        await expect(salesTable.locator("tbody tr").first()).toContainText("Shang-Chi");

        await locationSelect.selectOption("All Locations");
        await dateSelect.selectOption("all");
        await expect(revenueCard.locator(".admin-kpi-value")).toHaveText("€1,963.40");
        await expect(seatsCard.locator(".admin-kpi-value")).toHaveText("146 seats");
        await expect(salesTable.locator("tbody tr")).toHaveCount(3);

        await locationSelect.selectOption("Tampere");
        await dateSelect.selectOption("tomorrow");
        await expect(revenueCard.locator(".admin-kpi-value")).toHaveText("€0.00");
        await expect(seatsCard.locator(".admin-kpi-value")).toHaveText("0 seats");
        await expect(salesTable.locator("tbody tr")).toHaveCount(1);
        await expect(salesTable.locator("tbody tr").first()).toHaveText(
            "No screenings match the selected filter.",
        );
    });

    test("Calculates doors open and advertising timeline from screening start time", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto("/admin");

        const timeline = page.locator(".admin-rules-timeline");
        const startTimeInput = page.getByLabel("Start Time");

        await expect(timeline).toHaveText("Doors 17:33 · Ads 17:48 · Movie 18:00");

        await startTimeInput.fill("20:30");
        await expect(timeline).toHaveText("Doors 20:03 · Ads 20:18 · Movie 20:30");

        await startTimeInput.fill("00:10");
        await expect(timeline).toHaveText("Doors 23:43 · Ads 23:58 · Movie 00:10");
    });

    test("Imports a new movie into the Rio library and prevents duplicate imports", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto("/admin");

        const librarySelect = page.getByLabel("Movie · from Rio library");
        const importButton = page.getByRole("button", {
            name: "Import to Rio Database",
        });

        await expect(librarySelect.locator("option")).toHaveCount(3);

        await importButton.click();
        await expect(page.getByRole("status")).toContainText(
            '"Shang-Chi" is already in your Rio movie library.',
        );
        await expect(librarySelect.locator("option")).toHaveCount(3);

        await page.getByLabel("Search OMDb by title or IMDb ID").fill("Dune");
        await expect(page.locator(".admin-omdb-title")).toHaveText("Dune: Part Two");

        await importButton.click();
        await expect(page.getByRole("status")).toContainText(
            'Imported "Dune: Part Two" into Rio Database.',
        );
        await expect(librarySelect.locator("option")).toHaveCount(4);
        await expect(librarySelect.locator("option:checked")).toHaveText("Dune: Part Two");
    });

    test("Schedules a new screening with premiere surcharge and preserves owner seat #1", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto("/admin");

        const scheduledTable = page.locator("#movies-screenings .admin-table");
        await expect(scheduledTable.locator("tbody tr")).toHaveCount(3);

        await page.getByLabel("Movie · from Rio library").selectOption({ label: "Black Panther" });
        await page
            .getByRole("group", { name: "Location" })
            .getByRole("button", { name: "Tampere" })
            .click();
        await page
            .getByRole("group", { name: "Screening Room" })
            .getByRole("button", { name: /Room 1/ })
            .click();

        await page.locator("#movies-screenings").getByLabel("Date").fill("2026-11-20");

        await page.getByLabel("Start Time").fill("19:15");

        const premiereSwitch = page.getByRole("switch", {
            name: /First Screening Ever/i,
        });
        await premiereSwitch.click();
        await expect(premiereSwitch).toHaveAttribute("aria-checked", "true");

        await page.getByRole("button", { name: "Schedule Screening" }).click();

        await expect(page.getByRole("status")).toContainText(
            'Scheduled "Black Panther" in Tampere (Room 1) at 19:15. Seat #1 permanently reserved for owner.',
        );

        const rows = scheduledTable.locator("tbody tr");
        await expect(rows).toHaveCount(4);

        const createdRow = rows.nth(3);
        await expect(createdRow).toContainText("Black Panther");
        await expect(createdRow).toContainText("Tampere");
        await expect(createdRow).toContainText("Room 1 (100 seats)");
        await expect(createdRow).toContainText("20 Nov 2026 · 19:15");
        await expect(createdRow).toContainText("+15% premiere");
    });

    test("Edits an existing scheduled screening and supports cancelling edits", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto("/admin");

        const scheduledTable = page.locator("#movies-screenings .admin-table");
        const firstRow = scheduledTable.locator("tbody tr").first();

        await firstRow.getByRole("button", { name: "Edit" }).click();
        await expect(page.getByRole("heading", { name: "Edit scheduled screening" })).toBeVisible();

        await page.getByRole("button", { name: "Cancel Edit" }).click();
        await expect(page.getByRole("heading", { name: "Schedule a screening" })).toBeVisible();
        await expect(scheduledTable.locator("tbody tr")).toHaveCount(3);

        await firstRow.getByRole("button", { name: "Edit" }).click();
        await page
            .getByRole("group", { name: "Screening Room" })
            .getByRole("button", { name: /Room 2/ })
            .click();
        await page.getByLabel("Start Time").fill("21:00");
        await page.getByRole("switch", { name: /First Screening Ever/i }).click();

        await page.getByRole("button", { name: "Save Screening Changes" }).click();

        await expect(page.getByRole("status")).toContainText(
            'Updated screening for "Shang-Chi" in Oulu (Room 2). Seat #1 remains reserved for owner.',
        );
        await expect(scheduledTable.locator("tbody tr")).toHaveCount(3);
        await expect(firstRow).toContainText("Room 2 (200 seats)");
        await expect(firstRow).toContainText("Today · 21:00");
        await expect(firstRow).toContainText("+15% premiere");
    });

    test("Deletes a scheduled screening and updates the upcoming count", async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto("/admin");

        const scheduledTable = page.locator("#movies-screenings .admin-table");
        await expect(scheduledTable.locator("tbody tr")).toHaveCount(3);
        await expect(page.getByText("3 upcoming screenings")).toBeVisible();

        const targetRow = scheduledTable.locator("tbody tr").filter({ hasText: "Black Panther" });
        await targetRow.getByRole("button", { name: "Delete" }).click();

        await expect(page.getByRole("status")).toContainText(
            'Removed screening for "Black Panther".',
        );
        await expect(scheduledTable.locator("tbody tr")).toHaveCount(2);
        await expect(
            scheduledTable.locator("tbody tr").filter({
                hasText: "Black Panther",
            }),
        ).toHaveCount(0);
        await expect(page.getByText("2 upcoming screenings")).toBeVisible();
    });
});
