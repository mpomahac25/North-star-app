import {
    listAdminSales,
    listAdminScreenings,
} from "../dao/admin/adminReadDao.js";
import {
    deleteAdminScreeningById,
    insertAdminScreening,
    updateAdminScreeningById,
} from "../dao/admin/adminWriteDao.js";
import { getMovieByImdbId, importMovieByTitle } from "./movieCatalogService.js";

const VALID_CITIES = new Map([
    ["oulu", "Oulu"],
    ["tampere", "Tampere"],
]);

const VALID_ROOMS = new Map([
    ["room 1", "Room 1"],
    ["room 2", "Room 2"],
]);

const BASE_TICKET_PRICE = 13.0;
const PREMIERE_TICKET_PRICE = 14.95; // +15% premiere surcharge

export class AdminServiceError extends Error {
    constructor(message, status = 400, code = "ADMIN_VALIDATION_ERROR") {
        super(message);
        this.name = "AdminServiceError";
        this.status = status;
        this.code = code;
    }
}

function validateScreeningPayload(body) {
    const movieId = Number(body?.movieId);
    if (!Number.isSafeInteger(movieId) || movieId < 1) {
        throw new AdminServiceError(
            "Movie ID must be a positive integer.",
            400,
            "INVALID_MOVIE_ID",
        );
    }

    const cityKey = typeof body?.city === "string" ? body.city.trim().toLowerCase() : "";
    const city = VALID_CITIES.get(cityKey);
    if (!city) {
        throw new AdminServiceError("Location must be Oulu or Tampere.", 400, "INVALID_LOCATION");
    }

    const roomKey = typeof body?.roomName === "string" ? body.roomName.trim().toLowerCase() : "";
    const roomName = VALID_ROOMS.get(roomKey);
    if (!roomName) {
        throw new AdminServiceError("Room must be Room 1 or Room 2.", 400, "INVALID_ROOM");
    }

    const date = typeof body?.date === "string" ? body.date.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new AdminServiceError("Date must be in YYYY-MM-DD format.", 400, "INVALID_DATE");
    }

    const [year, month, day] = date.split("-").map(Number);
    const parsedDate = new Date(Date.UTC(year, month - 1, day));
    if (
        parsedDate.getUTCFullYear() !== year ||
        parsedDate.getUTCMonth() !== month - 1 ||
        parsedDate.getUTCDate() !== day
    ) {
        throw new AdminServiceError("Date is not a valid calendar date.", 400, "INVALID_DATE");
    }

    const startTime = typeof body?.startTime === "string" ? body.startTime.trim() : "";
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
        throw new AdminServiceError(
            "Start time must be in HH:MM 24-hour format.",
            400,
            "INVALID_START_TIME",
        );
    }

    const isFirstScreening = Boolean(body?.isFirstScreening);
    const ticketPrice = isFirstScreening ? PREMIERE_TICKET_PRICE : BASE_TICKET_PRICE;

    return {
        movieId,
        city,
        roomName,
        date,
        startTime,
        isFirstScreening,
        ticketPrice,
    };
}

function mapDaoError(errorCode) {
    switch (errorCode) {
        case "MOVIE_NOT_FOUND":
            throw new AdminServiceError("Selected movie was not found.", 404, "MOVIE_NOT_FOUND");
        case "ROOM_NOT_FOUND":
            throw new AdminServiceError("Selected room was not found.", 404, "ROOM_NOT_FOUND");
        case "SCREENING_NOT_FOUND":
            throw new AdminServiceError("Screening was not found.", 404, "SCREENING_NOT_FOUND");
        case "SCREENING_OVERLAP":
            throw new AdminServiceError(
                "This room already has another screening scheduled during that time.",
                409,
                "SCREENING_OVERLAP",
            );
        case "SCREENING_HAS_SALES":
            throw new AdminServiceError(
                "Cannot delete a screening that already has sold tickets.",
                409,
                "SCREENING_HAS_SALES",
            );
        default:
            throw new AdminServiceError("Could not process screening request.", 500, "ADMIN_ERROR");
    }
}

export async function getAdminSales() {
    return listAdminSales();
}

export async function getAdminScreenings() {
    return listAdminScreenings();
}

export async function createAdminScreening(body) {
    const validated = validateScreeningPayload(body);
    const result = await insertAdminScreening(validated);
    if (result.error) {
        mapDaoError(result.error);
    }
    return result.screening;
}

export async function updateAdminScreening(screeningId, body) {
    const validated = validateScreeningPayload(body);
    const result = await updateAdminScreeningById(screeningId, validated);
    if (result.error) {
        mapDaoError(result.error);
    }
    return result.screening;
}

export async function deleteAdminScreening(screeningId) {
    const result = await deleteAdminScreeningById(screeningId);
    if (result.error) {
        mapDaoError(result.error);
    }
    return result;
}

export async function importAdminMovie(body) {
    const imdbId = typeof body?.imdbId === "string" ? body.imdbId.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const year =
        body?.year === undefined || body?.year === null ? undefined : String(body.year).trim();

    if (imdbId) {
        if (!/^tt\d+$/.test(imdbId)) {
            throw new AdminServiceError(
                "IMDb ID must match format tt1234567.",
                400,
                "INVALID_IMDB_ID",
            );
        }
        return getMovieByImdbId(imdbId);
    }

    if (!title || title.length > 100) {
        throw new AdminServiceError(
            "Provide a valid IMDb ID or a title (1 to 100 characters).",
            400,
            "INVALID_TITLE",
        );
    }

    if (year !== undefined && year !== "" && !/^\d{4}$/.test(year)) {
        throw new AdminServiceError("Year must be a four-digit year.", 400, "INVALID_RELEASE_YEAR");
    }

    return importMovieByTitle(title, year || undefined);
}
