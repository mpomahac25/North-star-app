import {
    listAdminSales,
    listAdminScreenings,
    listAdminTheatres,
} from "../dao/admin/adminReadDao.js";
import {
    deleteAdminRoomById,
    deleteAdminScreeningById,
    deleteAdminTheatreById,
    insertAdminRoom,
    insertAdminScreening,
    insertAdminTheatre,
    updateAdminRoomById,
    updateAdminScreeningById,
    updateAdminTheatreById,
} from "../dao/admin/adminWriteDao.js";
import { getMovieByImdbId, importMovieByTitle } from "./movieCatalogService.js";

export class AdminServiceError extends Error {
    constructor(message, status = 400, code = "ADMIN_VALIDATION_ERROR") {
        super(message);
        this.name = "AdminServiceError";
        this.status = status;
        this.code = code;
    }
}

function validateTheatrePayload(body) {
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 100) {
        throw new AdminServiceError(
            "Theatre name must be between 1 and 100 characters.",
            400,
            "INVALID_THEATRE_NAME",
        );
    }

    const city = typeof body?.city === "string" ? body.city.trim() : "";
    if (!city || city.length > 100) {
        throw new AdminServiceError(
            "City must be between 1 and 100 characters.",
            400,
            "INVALID_LOCATION",
        );
    }

    const address = typeof body?.address === "string" ? body.address.trim() : "";
    if (!address || address.length > 255) {
        throw new AdminServiceError(
            "Address must be between 1 and 255 characters.",
            400,
            "INVALID_ADDRESS",
        );
    }

    const rawTimezone =
        body?.timezone === undefined || body?.timezone === null || body?.timezone === ""
            ? "Europe/Helsinki"
            : String(body.timezone).trim();

    if (rawTimezone.length > 50) {
        throw new AdminServiceError("Timezone is invalid.", 400, "INVALID_TIMEZONE");
    }

    try {
        Intl.DateTimeFormat(undefined, { timeZone: rawTimezone });
    } catch {
        throw new AdminServiceError("Timezone must be a valid IANA timezone.", 400, "INVALID_TIMEZONE");
    }

    return {
        name,
        city,
        address,
        timezone: rawTimezone,
    };
}

function validateRoomPayload(body) {
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 50) {
        throw new AdminServiceError(
            "Room name must be between 1 and 50 characters.",
            400,
            "INVALID_ROOM",
        );
    }

    const capacity = Number(body?.capacity);
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 5000) {
        throw new AdminServiceError(
            "Room capacity must be a positive integer (1 to 5000).",
            400,
            "INVALID_ROOM_CAPACITY",
        );
    }

    return {
        name,
        capacity,
    };
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

    const city = typeof body?.city === "string" ? body.city.trim() : "";
    if (!city || city.length > 100) {
        throw new AdminServiceError("Location is required.", 400, "INVALID_LOCATION");
    }

    const roomName = typeof body?.roomName === "string" ? body.roomName.trim() : "";
    if (!roomName || roomName.length > 50) {
        throw new AdminServiceError("Screening room is required.", 400, "INVALID_ROOM");
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

    return {
        movieId,
        city,
        roomName,
        date,
        startTime,
    };
}

function mapDaoError(errorCode) {
    switch (errorCode) {
        case "MOVIE_NOT_FOUND":
            throw new AdminServiceError("Selected movie was not found.", 404, "MOVIE_NOT_FOUND");
        case "THEATRE_NOT_FOUND":
            throw new AdminServiceError("Selected theatre was not found.", 404, "THEATRE_NOT_FOUND");
        case "THEATRE_ALREADY_EXISTS":
            throw new AdminServiceError(
                "A theatre with that name already exists in this city.",
                409,
                "THEATRE_ALREADY_EXISTS",
            );
        case "THEATRE_HAS_SCREENINGS":
            throw new AdminServiceError(
                "Cannot delete a theatre that still has scheduled screenings.",
                409,
                "THEATRE_HAS_SCREENINGS",
            );
        case "ROOM_NOT_FOUND":
            throw new AdminServiceError("Selected room was not found.", 404, "ROOM_NOT_FOUND");
        case "ROOM_ALREADY_EXISTS":
            throw new AdminServiceError(
                "A room with that name already exists in this theatre.",
                409,
                "ROOM_ALREADY_EXISTS",
            );
        case "ROOM_HAS_SCREENINGS":
            throw new AdminServiceError(
                "Cannot delete a room that still has scheduled screenings.",
                409,
                "ROOM_HAS_SCREENINGS",
            );
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
        case "ROOM_CAPACITY_EXCEEDED":
            throw new AdminServiceError(
                "Room capacity cannot be smaller than tickets already sold.",
                409,
                "ROOM_CAPACITY_EXCEEDED",
            );
        default:
            throw new AdminServiceError("Could not process admin request.", 500, "ADMIN_ERROR");
    }
}

export async function getAdminSales() {
    return listAdminSales();
}

export async function getAdminScreenings() {
    return listAdminScreenings();
}

export async function getAdminTheatres() {
    return listAdminTheatres();
}

export async function createAdminTheatre(body) {
    const validated = validateTheatrePayload(body);
    const result = await insertAdminTheatre(validated);
    if (result.error) {
        mapDaoError(result.error);
    }
    return result.theatre;
}

export async function updateAdminTheatre(theatreId, body) {
    const validated = validateTheatrePayload(body);
    const result = await updateAdminTheatreById(theatreId, validated);
    if (result.error) {
        mapDaoError(result.error);
    }
    return result.theatre;
}

export async function deleteAdminTheatre(theatreId) {
    const result = await deleteAdminTheatreById(theatreId);
    if (result.error) {
        mapDaoError(result.error);
    }
    return result;
}

export async function createAdminRoom(theatreId, body) {
    const validated = validateRoomPayload(body);
    const result = await insertAdminRoom(theatreId, validated);
    if (result.error) {
        mapDaoError(result.error);
    }
    return result.room;
}

export async function updateAdminRoom(roomId, body) {
    const validated = validateRoomPayload(body);
    const result = await updateAdminRoomById(roomId, validated);
    if (result.error) {
        mapDaoError(result.error);
    }
    return result.room;
}

export async function deleteAdminRoom(roomId) {
    const result = await deleteAdminRoomById(roomId);
    if (result.error) {
        mapDaoError(result.error);
    }
    return result;
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
