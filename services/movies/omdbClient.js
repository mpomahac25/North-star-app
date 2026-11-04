const OMDB_URL = "https://www.omdbapi.com/";
const REQUEST_TIMEOUT_MS = 8000;

export class OmdbError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "OmdbError";
    this.status = status;
  }
}

function getApiKey() {
  const apiKey = process.env.OMDB_API_KEY?.trim();

  if (!apiKey) {
    throw new OmdbError(
      "Movies service is not configured with an OMDb API key.",
      503,
    );
  }

  return apiKey;
}

async function requestOmdb(params) {
  const searchParams = new URLSearchParams({
    apikey: getApiKey(),
    r: "json",
    ...params,
  });

  let response;
  try {
    response = await fetch(`${OMDB_URL}?${searchParams}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const message =
      error.name === "TimeoutError"
        ? "OMDb request timed out."
        : "Could not connect to OMDb.";
    throw new OmdbError(message);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    if (!response.ok) {
      throw new OmdbError(`OMDb returned HTTP ${response.status}.`);
    }
    throw new OmdbError("OMDb returned an invalid response.");
  }

  if (!response.ok) {
    if (
      data.Error === "Invalid API key!" ||
      data.Error === "No API key provided."
    ) {
      throw new OmdbError(
        "OMDb rejected the API key. Check OMDB_API_KEY in the project .env and restart the service.",
        503,
      );
    }
    throw new OmdbError(
      `OMDb returned HTTP ${response.status}${data.Error ? `: ${data.Error}` : ""}.`,
    );
  }

  if (data.Response === "False") {
    if (data.Error === "Invalid API key!") {
      throw new OmdbError("OMDb rejected the configured API key.", 503);
    }
    return { data: null, error: data.Error };
  }

  return { data, error: null };
}

export async function searchMovies({ query, page, year, type }) {
  const params = { s: query, page: String(page) };
  if (year) params.y = year;
  if (type) params.type = type;

  const result = await requestOmdb(params);
  if (result.data) return result.data;

  if (result.error === "Movie not found!") {
    return { Search: [], totalResults: "0", Response: "True" };
  }

  throw new OmdbError(result.error || "OMDb could not complete the search.");
}

export async function getMovieById(imdbId) {
  const result = await requestOmdb({ i: imdbId, plot: "full" });
  if (result.data) return result.data;

  if (result.error === "Movie not found!") {
    throw new OmdbError("Movie not found.", 404);
  }

  throw new OmdbError(result.error || "OMDb could not load the movie.");
}

export async function getMovieByTitle(title, year) {
  const params = { t: title, plot: "full" };
  if (year) params.y = year;

  const result = await requestOmdb(params);
  if (result.data) return result.data;

  if (result.error === "Movie not found!") {
    throw new OmdbError("Movie not found.", 404);
  }

  throw new OmdbError(result.error || "OMDb could not load the movie.");
}
