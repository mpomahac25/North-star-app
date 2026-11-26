import { expect, test } from "@playwright/test";

function localIsoDate(daysOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatFinnishDate(isoDate) {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

async function setupStatefulAdminApi(page) {
  const todayIso = localIsoDate(0);
  const laterIso = localIsoDate(4);

  const movies = [
    {
      id: 1,
      imdbId: "tt9376612",
      imdb_id: "tt9376612",
      title: "Shang-Chi",
      durationMinutes: 132,
      duration_minutes: 132,
    },
    {
      id: 2,
      imdbId: "tt1825683",
      imdb_id: "tt1825683",
      title: "Black Panther",
      durationMinutes: 134,
      duration_minutes: 134,
    },
    {
      id: 3,
      imdbId: "tt1375666",
      imdb_id: "tt1375666",
      title: "Inception",
      durationMinutes: 148,
      duration_minutes: 148,
    },
  ];

  let screenings = [
    {
      id: 101,
      movieId: 1,
      movieTitle: "Shang-Chi",
      city: "Oulu",
      roomName: "Room 1",
      capacity: 100,
      date: todayIso,
      startTime: "18:00",
      showtime: "18:00",
      ticketPrice: 13.0,
      isFirstScreening: false,
      seatsSold: 68,
      revenue: 884.0,
    },
    {
      id: 102,
      movieId: 2,
      movieTitle: "Black Panther",
      city: "Tampere",
      roomName: "Room 2",
      capacity: 200,
      date: todayIso,
      startTime: "19:30",
      showtime: "19:30",
      ticketPrice: 13.0,
      isFirstScreening: false,
      seatsSold: 46,
      revenue: 601.0,
    },
    {
      id: 103,
      movieId: 3,
      movieTitle: "Inception",
      city: "Oulu",
      roomName: "Room 2",
      capacity: 200,
      date: laterIso,
      startTime: "20:00",
      showtime: "20:00",
      ticketPrice: 14.95,
      isFirstScreening: true,
      seatsSold: 32,
      revenue: 478.4,
    },
  ];

  let nextMovieId = 4;
  let nextScreeningId = 104;

  await page.route("**/api/movies**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: movies,
        total: movies.length,
        page: 1,
        limit: 100,
      }),
    });
  });

  await page.route("**/api/admin/movies/search**", async (route) => {
    const url = new URL(route.request().url());
    const query = (url.searchParams.get("q") || "").trim().toLowerCase();

    const movieData = query.includes("shang")
      ? {
          Title: "Shang-Chi",
          Year: "2021",
          imdbID: "tt9376612",
          Type: "movie",
        }
      : {
          Title: "Dune: Part Two",
          Year: "2024",
          imdbID: "tt15239678",
          Type: "movie",
        };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        /^tt\d+$/i.test(query) ? movieData : { Search: [movieData] },
      ),
    });
  });

  await page.route("**/api/admin/movies/import", async (route) => {
    const body = route.request().postDataJSON() || {};
    const title = body.title || "Dune: Part Two";
    const imdbId = body.imdbId || "tt15239678";

    const existing = movies.find(
      (m) =>
        m.imdbId === imdbId || m.title.toLowerCase() === title.toLowerCase(),
    );
    if (existing) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(existing),
      });
      return;
    }

    const imported = {
      id: nextMovieId++,
      imdbId,
      imdb_id: imdbId,
      title,
      durationMinutes: 166,
      duration_minutes: 166,
    };
    movies.push(imported);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(imported),
    });
  });

  await page.route("**/api/admin/sales", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(screenings),
    });
  });

  await page.route("**/api/admin/screenings**", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const idMatch = url.pathname.match(/\/api\/admin\/screenings\/(\d+)$/);

    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(screenings),
      });
      return;
    }

    if (method === "POST") {
      const payload = request.postDataJSON() || {};
      const movie =
        movies.find((m) => m.id === Number(payload.movieId)) || movies[0];
      const isFirst = Boolean(payload.isFirstScreening);
      const created = {
        id: nextScreeningId++,
        movieId: movie.id,
        movieTitle: movie.title,
        city: payload.city,
        roomName: payload.roomName,
        capacity: payload.roomName === "Room 2" ? 200 : 100,
        date: payload.date,
        startTime: payload.startTime,
        showtime: payload.startTime,
        ticketPrice: isFirst ? 14.95 : 13.0,
        isFirstScreening: isFirst,
        seatsSold: 0,
        revenue: 0,
      };
      screenings.push(created);

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(created),
      });
      return;
    }

    if (method === "PUT" && idMatch) {
      const targetId = Number(idMatch[1]);
      const payload = request.postDataJSON() || {};
      const index = screenings.findIndex((s) => s.id === targetId);
      const movie =
        movies.find((m) => m.id === Number(payload.movieId)) ||
        screenings[index];
      const isFirst = Boolean(payload.isFirstScreening);

      screenings[index] = {
        ...screenings[index],
        movieId: movie.id || screenings[index].movieId,
        movieTitle: movie.title || screenings[index].movieTitle,
        city: payload.city ?? screenings[index].city,
        roomName: payload.roomName ?? screenings[index].roomName,
        capacity:
          (payload.roomName ?? screenings[index].roomName) === "Room 2"
            ? 200
            : 100,
        date: payload.date ?? screenings[index].date,
        startTime: payload.startTime ?? screenings[index].startTime,
        showtime: payload.startTime ?? screenings[index].showtime,
        ticketPrice: isFirst ? 14.95 : 13.0,
        isFirstScreening: isFirst,
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(screenings[index]),
      });
      return;
    }

    if (method === "DELETE" && idMatch) {
      const targetId = Number(idMatch[1]);
      screenings = screenings.filter((s) => s.id !== targetId);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ deleted: true, id: targetId }),
      });
    }
  });
}

test.describe("Admin Dashboard", () => {
  test("Displays sections, navigation tabs, and owner seat #1 rule on desktop and mobile", async ({
    page,
  }) => {
    await setupStatefulAdminApi(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/admin");

    await expect(
      page.getByRole("heading", { name: "Rio Cinema dashboard" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "1. Sales Overview" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "2. Movies & Screenings" }),
    ).toBeVisible();

    const nav = page.locator(".admin-section-tabs");
    await expect(
      nav.getByRole("button", { name: "1. Sales Overview" }),
    ).toBeVisible();
    await expect(
      nav.getByRole("button", { name: "2. Movies & Screenings" }),
    ).toBeVisible();

    await expect(
      page.getByText(
        "Seat #1 is permanently reserved for the owner in every screening and is not included in seats sold.",
      ),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });

    await expect(
      page.getByRole("heading", { name: "1. Sales Overview" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "2. Movies & Screenings" }),
    ).toBeVisible();

    const hasHorizontalScroll = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
  });

  test("Calculates sales KPIs and filters screenings by location and date", async ({
    page,
  }) => {
    await setupStatefulAdminApi(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/admin");

    const kpiCards = page.locator(".admin-kpi-card");
    const revenueCard = kpiCards.first();
    const seatsCard = kpiCards.nth(1);
    const salesTable = page.locator("#sales-overview .admin-table");

    await expect(revenueCard.locator(".admin-kpi-value")).toHaveText(
      "€1,485.00",
    );
    await expect(seatsCard.locator(".admin-kpi-value")).toHaveText("114 seats");
    await expect(salesTable.locator("tbody tr")).toHaveCount(2);

    const locationSelect = page.getByRole("combobox", { name: "Location" });
    const dateSelect = page.getByRole("combobox", { name: "Date" });

    await locationSelect.selectOption("Oulu");
    await expect(revenueCard.locator(".admin-kpi-value")).toHaveText("€884.00");
    await expect(seatsCard.locator(".admin-kpi-value")).toHaveText("68 seats");
    await expect(salesTable.locator("tbody tr")).toHaveCount(1);
    await expect(salesTable.locator("tbody tr").first()).toContainText(
      "Shang-Chi",
    );

    await locationSelect.selectOption("All Locations");
    await dateSelect.selectOption("all");
    await expect(revenueCard.locator(".admin-kpi-value")).toHaveText(
      "€1,963.40",
    );
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
    await setupStatefulAdminApi(page);
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
    await setupStatefulAdminApi(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/admin");

    const librarySelect = page.getByLabel("Movie · from Rio library");
    const importButton = page.getByRole("button", {
      name: "Import to Rio Database",
    });

    await expect(librarySelect.locator("option")).toHaveCount(3);

    await page.getByLabel("Search OMDb by title or IMDb ID").fill("Shang-Chi");
    await expect(page.locator(".admin-omdb-title")).toHaveText("Shang-Chi");

    await importButton.click();
    await expect(page.getByRole("status")).toContainText(
      '"Shang-Chi" is already in your Rio movie library.',
    );
    await expect(librarySelect.locator("option")).toHaveCount(3);

    await page.getByLabel("Search OMDb by title or IMDb ID").fill("Dune");
    await expect(page.locator(".admin-omdb-title")).toHaveText(
      "Dune: Part Two",
    );

    await importButton.click();
    await expect(page.getByRole("status")).toContainText(
      'Imported "Dune: Part Two" into Rio Database.',
    );
    await expect(librarySelect.locator("option")).toHaveCount(4);
    await expect(librarySelect.locator("option:checked")).toHaveText(
      "Dune: Part Two",
    );
  });

  test("Schedules a new screening with premiere surcharge and preserves owner seat #1", async ({
    page,
  }) => {
    await setupStatefulAdminApi(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/admin");

    const futureDate = localIsoDate(7);
    const scheduledTable = page.locator("#movies-screenings .admin-table");
    await expect(scheduledTable.locator("tbody tr")).toHaveCount(3);

    await page
      .getByLabel("Movie · from Rio library")
      .selectOption({ label: "Black Panther" });
    await page
      .getByRole("group", { name: "Location" })
      .getByRole("button", { name: "Tampere" })
      .click();
    await page
      .getByRole("group", { name: "Screening Room" })
      .getByRole("button", { name: /Room 1/ })
      .click();

    await page
      .locator("#movies-screenings")
      .getByLabel("Date")
      .fill(futureDate);
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
    await expect(createdRow).toContainText(
      `${formatFinnishDate(futureDate)} · 19:15`,
    );
    await expect(createdRow).toContainText("+15% premiere");
  });

  test("Edits an existing scheduled screening and supports cancelling edits", async ({
    page,
  }) => {
    await setupStatefulAdminApi(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/admin");

    const scheduledTable = page.locator("#movies-screenings .admin-table");
    const firstRow = scheduledTable.locator("tbody tr").first();

    await firstRow.getByRole("button", { name: "Edit" }).click();
    await expect(
      page.getByRole("heading", { name: "Edit scheduled screening" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Cancel Edit" }).click();
    await expect(
      page.getByRole("heading", { name: "Schedule a screening" }),
    ).toBeVisible();
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
    await expect(firstRow).toContainText(
      `${formatFinnishDate(localIsoDate(0))} · 21:00`,
    );
    await expect(firstRow).toContainText("+15% premiere");
  });

  test("Deletes a scheduled screening and updates the upcoming count", async ({
    page,
  }) => {
    await setupStatefulAdminApi(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/admin");

    const scheduledTable = page.locator("#movies-screenings .admin-table");
    await expect(scheduledTable.locator("tbody tr")).toHaveCount(3);
    await expect(page.getByText("3 upcoming screenings")).toBeVisible();

    const targetRow = scheduledTable
      .locator("tbody tr")
      .filter({ hasText: "Black Panther" });
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

  test("Surfaces backend overlap and sales-protection errors in the UI", async ({
    page,
  }) => {
    await setupStatefulAdminApi(page);

    await page.route("**/api/admin/screenings", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "SCREENING_OVERLAP",
              message:
                "This room already has another screening scheduled during that time.",
            },
          }),
        });
        return;
      }
      await route.fallback();
    });

    await page.route("**/api/admin/screenings/*", async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "SCREENING_HAS_SALES",
              message:
                "Cannot delete a screening that already has sold tickets.",
            },
          }),
        });
        return;
      }
      await route.fallback();
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/admin");

    await page.getByRole("button", { name: "Schedule Screening" }).click();
    await expect(
      page.getByText(
        "This room already has another screening scheduled during that time.",
      ),
    ).toBeVisible();

    const scheduledTable = page.locator("#movies-screenings .admin-table");
    await scheduledTable
      .locator("tbody tr")
      .first()
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(
      page.getByText(
        "Cannot delete a screening that already has sold tickets.",
      ),
    ).toBeVisible();
    await expect(scheduledTable.locator("tbody tr")).toHaveCount(3);
  });

  test("Communicates with real backend admin endpoints without page errors", async ({
    page,
  }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    const salesResponsePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/admin/sales") &&
        res.request().method() === "GET",
    );
    const screeningsResponsePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/admin/screenings") &&
        res.request().method() === "GET",
    );

    await page.goto("/admin");

    const [salesRes, screeningsRes] = await Promise.all([
      salesResponsePromise,
      screeningsResponsePromise,
    ]);

    expect(salesRes.status()).toBe(200);
    expect(screeningsRes.status()).toBe(200);
    expect(await salesRes.json()).toEqual(expect.any(Array));
    expect(await screeningsRes.json()).toEqual(expect.any(Array));
    expect(pageErrors).toEqual([]);

    await expect(
      page.getByRole("heading", { name: "Rio Cinema dashboard" }),
    ).toBeVisible();
  });
});
