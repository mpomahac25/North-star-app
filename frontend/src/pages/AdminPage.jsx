import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import {
    createAdminRoom,
    createAdminScreening,
    createAdminTheatre,
    deleteAdminRoom,
    deleteAdminScreening,
    deleteAdminTheatre,
    fetchAdminDashboardInitialData,
    importMovieFromOmdb,
    searchAdminOmdbMovies,
    updateAdminRoom,
    updateAdminScreening,
    updateAdminTheatre,
} from "../api";
import { formatDate } from "../utils/dateFormat";
import "./AdminPage.css";

function formatCurrency(amount) {
    return `€${Number(amount).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function formatDateLabel(isoDate) {
    return formatDate(isoDate) || isoDate;
}

function getLocalIsoDate(daysOffset = 0) {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function calculateShowtimeSchedule(startTime) {
    const [hoursStr, minsStr] = (startTime || "18:00").split(":");
    const movieMinutes = Number(hoursStr) * 60 + Number(minsStr);

    if (Number.isNaN(movieMinutes)) {
        return { doors: "17:33", ads: "17:48", movie: "18:00" };
    }

    const formatMinutes = (total) => {
        const normalized = ((total % 1440) + 1440) % 1440;
        const hh = String(Math.floor(normalized / 60)).padStart(2, "0");
        const mm = String(normalized % 60).padStart(2, "0");
        return `${hh}:${mm}`;
    };

    return {
        doors: formatMinutes(movieMinutes - 27),
        ads: formatMinutes(movieMinutes - 12),
        movie: formatMinutes(movieMinutes),
    };
}

export default function AdminPage() {
    const [activeSection, setActiveSection] = useState("sales");

    const [theatres, setTheatres] = useState([]);
    const [libraryMovies, setLibraryMovies] = useState([]);
    const [omdbCatalog, setOmdbCatalog] = useState([]);
    const [salesScreenings, setSalesScreenings] = useState([]);
    const [scheduledScreenings, setScheduledScreenings] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [statusBanner, setStatusBanner] = useState("");

    // Section 1 filters
    const [locationFilter, setLocationFilter] = useState("All Locations");
    const [dateFilter, setDateFilter] = useState("today");

    // Section 2A: OMDb import
    const [omdbQuery, setOmdbQuery] = useState("");

    // Section 2B: Schedule screening form
    const [editingScreeningId, setEditingScreeningId] = useState(null);
    const [isSubmittingScreening, setIsSubmittingScreening] = useState(false);
    const [selectedMovieId, setSelectedMovieId] = useState(1);
    const [selectedLocation, setSelectedLocation] = useState("");
    const [selectedRoom, setSelectedRoom] = useState("");
    const [screeningDate, setScreeningDate] = useState(() => getLocalIsoDate(0));
    const [screeningStartTime, setScreeningStartTime] = useState("18:00");

    // Section 2C: Theatre & Room CRUD
    const [editingTheatreId, setEditingTheatreId] = useState(null);
    const [theatreNameInput, setTheatreNameInput] = useState("");
    const [theatreCityInput, setTheatreCityInput] = useState("");
    const [theatreAddressInput, setTheatreAddressInput] = useState("");
    const [isSubmittingTheatre, setIsSubmittingTheatre] = useState(false);

    const [roomDrafts, setRoomDrafts] = useState({});
    const [editingRoomId, setEditingRoomId] = useState(null);
    const [submittingRoomTheatreId, setSubmittingRoomTheatreId] = useState(null);

    const salesRef = useRef(null);
    const moviesRef = useRef(null);
    const scheduleFormRef = useRef(null);

    const todayIso = getLocalIsoDate(0);
    const tomorrowIso = getLocalIsoDate(1);

    const syncSelectedLocationAndRoom = (nextTheatres, preferredCity, preferredRoom) => {
        if (!Array.isArray(nextTheatres) || nextTheatres.length === 0) {
            setSelectedLocation("");
            setSelectedRoom("");
            return;
        }

        const matchedTheatre =
            nextTheatres.find((t) => t.city === preferredCity) || nextTheatres[0];
        setSelectedLocation(matchedTheatre.city);

        const availableRooms = matchedTheatre.rooms || [];
        if (availableRooms.length === 0) {
            setSelectedRoom("");
            return;
        }

        const matchedRoom =
            availableRooms.find((r) => r.name === preferredRoom) || availableRooms[0];
        setSelectedRoom(matchedRoom.name);
    };

    useEffect(() => {
        let isMounted = true;

        async function loadAdminData() {
            try {
                const data = await fetchAdminDashboardInitialData();
                if (!isMounted) return;

                setTheatres(data.theatres);
                setLibraryMovies(data.libraryMovies);
                setOmdbCatalog(data.omdbCatalog);
                setSalesScreenings(data.salesScreenings);
                setScheduledScreenings(data.scheduledScreenings);

                if (data.libraryMovies.length > 0) {
                    setSelectedMovieId(data.libraryMovies[0].id);
                }

                syncSelectedLocationAndRoom(data.theatres, "Oulu", "Room 1");
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        }

        loadAdminData();
        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        const handleScroll = () => {
            const moviesEl = moviesRef.current;
            if (!moviesEl) return;

            const rect = moviesEl.getBoundingClientRect();
            if (rect.top <= 220) {
                setActiveSection("movies");
            } else {
                setActiveSection("sales");
            }
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const locationOptions = useMemo(() => {
        const seen = new Set();
        const cities = [];
        for (const t of theatres) {
            if (t.city && !seen.has(t.city)) {
                seen.add(t.city);
                cities.push(t.city);
            }
        }
        return cities;
    }, [theatres]);

    const availableRoomsForSelectedLocation = useMemo(() => {
        const matchingTheatres = theatres.filter((t) => t.city === selectedLocation);
        return matchingTheatres.flatMap((t) => t.rooms || []);
    }, [theatres, selectedLocation]);

    const handleSelectLocation = (city) => {
        setSelectedLocation(city);
        const matchingRooms = theatres
            .filter((t) => t.city === city)
            .flatMap((t) => t.rooms || []);
        if (matchingRooms.length === 0) {
            setSelectedRoom("");
        } else if (!matchingRooms.some((r) => r.name === selectedRoom)) {
            setSelectedRoom(matchingRooms[0].name);
        }
    };

    const scrollToSection = (sectionKey) => {
        setActiveSection(sectionKey);
        const targetRef = sectionKey === "sales" ? salesRef : moviesRef;
        targetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const filteredSales = useMemo(() => {
        return salesScreenings.filter((item) => {
            const matchesLocation =
                locationFilter === "All Locations" || item.city === locationFilter;
            const matchesDate = dateFilter === "all" || item.dateKey === dateFilter;
            return matchesLocation && matchesDate;
        });
    }, [salesScreenings, locationFilter, dateFilter]);

    const salesMetrics = useMemo(() => {
        const totalRevenue = filteredSales.reduce((sum, s) => sum + s.revenue, 0);
        const totalSeats = filteredSales.reduce((sum, s) => sum + s.seatsSold, 0);

        const breakdownCities =
            locationOptions.length > 0 ? locationOptions : ["Oulu", "Tampere"];

        const byCity = breakdownCities.map((city) => {
            const citySales = filteredSales.filter((s) => s.city === city);
            return {
                city,
                revenue: citySales.reduce((sum, s) => sum + s.revenue, 0),
                seats: citySales.reduce((sum, s) => sum + s.seatsSold, 0),
            };
        });

        return {
            totalRevenue,
            totalSeats,
            byCity,
        };
    }, [filteredSales, locationOptions]);

    const [remoteSearch, setRemoteSearch] = useState({
        query: "",
        items: [],
        loading: false,
    });

    const cleanedOmdbQuery = omdbQuery.trim();

    const hasLocalOmdbMatch = useMemo(() => {
        if (!cleanedOmdbQuery) return false;
        const lower = cleanedOmdbQuery.toLowerCase();
        return omdbCatalog.some(
            (movie) =>
                movie.title.toLowerCase().includes(lower) ||
                (movie.imdbId && movie.imdbId.toLowerCase().includes(lower)),
        );
    }, [omdbCatalog, cleanedOmdbQuery]);

    useEffect(() => {
        if (cleanedOmdbQuery.length < 2 || hasLocalOmdbMatch) {
            return;
        }

        let cancelled = false;

        const timer = setTimeout(async () => {
            setRemoteSearch({ query: cleanedOmdbQuery, items: [], loading: true });
            try {
                const results = await searchAdminOmdbMovies(cleanedOmdbQuery);
                if (!cancelled) {
                    setRemoteSearch({ query: cleanedOmdbQuery, items: results, loading: false });
                }
            } catch {
                if (!cancelled) {
                    setRemoteSearch({ query: cleanedOmdbQuery, items: [], loading: false });
                }
            }
        }, 350);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [cleanedOmdbQuery, hasLocalOmdbMatch]);

    const isSearchingOmdb =
        cleanedOmdbQuery.length >= 2 &&
        !hasLocalOmdbMatch &&
        (remoteSearch.query !== cleanedOmdbQuery || remoteSearch.loading);

    const previewMovie = useMemo(() => {
        if (!cleanedOmdbQuery) {
            return omdbCatalog[0] || null;
        }

        const lower = cleanedOmdbQuery.toLowerCase();
        const localMatch = omdbCatalog.find(
            (movie) =>
                movie.title.toLowerCase().includes(lower) ||
                (movie.imdbId && movie.imdbId.toLowerCase().includes(lower)),
        );

        if (localMatch) return localMatch;
        if (remoteSearch.query === cleanedOmdbQuery) {
            return remoteSearch.items[0] || null;
        }
        return null;
    }, [omdbCatalog, cleanedOmdbQuery, remoteSearch]);

    const isPreviewAlreadyImported = useMemo(() => {
        if (!previewMovie) return false;
        return libraryMovies.some(
            (m) =>
                (previewMovie.imdbId && m.imdbId === previewMovie.imdbId) ||
                m.title.toLowerCase() === previewMovie.title.toLowerCase(),
        );
    }, [libraryMovies, previewMovie]);

    const showtimeBreakdown = useMemo(
        () => calculateShowtimeSchedule(screeningStartTime),
        [screeningStartTime],
    );

    const isAutoPremiere = useMemo(() => {
        const movieIdNum = Number(selectedMovieId);
        return !scheduledScreenings.some(
            (s) => s.movieId === movieIdNum && s.id !== editingScreeningId,
        );
    }, [scheduledScreenings, selectedMovieId, editingScreeningId]);

    const refreshAdminData = async (preferredCity = selectedLocation, preferredRoom = selectedRoom) => {
        const data = await fetchAdminDashboardInitialData();
        setTheatres(data.theatres);
        setLibraryMovies(data.libraryMovies);
        setOmdbCatalog(data.omdbCatalog);
        setSalesScreenings(data.salesScreenings);
        setScheduledScreenings(data.scheduledScreenings);
        syncSelectedLocationAndRoom(data.theatres, preferredCity, preferredRoom);
    };

    const handleImportMovie = async () => {
        if (!previewMovie) return;

        if (isPreviewAlreadyImported) {
            const existing = libraryMovies.find(
                (m) =>
                    (previewMovie.imdbId && m.imdbId === previewMovie.imdbId) ||
                    m.title.toLowerCase() === previewMovie.title.toLowerCase(),
            );
            if (existing) {
                setSelectedMovieId(existing.id);
            }
            setStatusBanner(`"${previewMovie.title}" is already in your Rio movie library.`);
            return;
        }

        try {
            const savedMovie = await importMovieFromOmdb(previewMovie);
            await refreshAdminData();
            setSelectedMovieId(savedMovie.id);
            setStatusBanner(`Imported "${savedMovie.title}" into Rio Database.`);
        } catch (err) {
            setStatusBanner(err.message || "Could not import movie.");
        }
    };

    const handleScheduleSubmit = async (e) => {
        e.preventDefault();
        if (isSubmittingScreening) return;

        const chosenMovie = libraryMovies.find((m) => m.id === Number(selectedMovieId));
        const chosenRoom = availableRoomsForSelectedLocation.find((r) => r.name === selectedRoom);

        if (!chosenMovie || !selectedLocation || !chosenRoom) {
            setStatusBanner("Select a valid movie, location, and room before scheduling.");
            return;
        }

        const payload = {
            movieId: chosenMovie.id,
            movieTitle: chosenMovie.title,
            city: selectedLocation,
            roomName: chosenRoom.name,
            capacity: chosenRoom.capacity,
            date: screeningDate,
            startTime: screeningStartTime,
            isFirstScreening: isAutoPremiere,
        };

        setIsSubmittingScreening(true);
        try {
            if (editingScreeningId !== null) {
                await updateAdminScreening(editingScreeningId, payload);
                await refreshAdminData();
                setEditingScreeningId(null);
                setStatusBanner(
                    `Updated screening for "${chosenMovie.title}" in ${selectedLocation} (${chosenRoom.name}). Seat #1 remains reserved for owner.`,
                );
            } else {
                await createAdminScreening(payload);
                await refreshAdminData();
                setStatusBanner(
                    `Scheduled "${chosenMovie.title}" in ${selectedLocation} (${chosenRoom.name}) at ${screeningStartTime}. Seat #1 permanently reserved for owner.`,
                );
            }
        } catch (err) {
            setStatusBanner(err.message || "Could not save screening.");
        } finally {
            setIsSubmittingScreening(false);
        }
    };

    const handleEditScreening = (screening) => {
        setEditingScreeningId(screening.id);
        setSelectedMovieId(screening.movieId);
        setSelectedLocation(screening.city);
        setSelectedRoom(screening.roomName);
        setScreeningDate(screening.date);
        setScreeningStartTime(screening.startTime);
        scheduleFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    const handleDeleteScreening = async (id, title) => {
        try {
            await deleteAdminScreening(id);
            await refreshAdminData();
            if (editingScreeningId === id) {
                setEditingScreeningId(null);
            }
            setStatusBanner(`Removed screening for "${title}".`);
        } catch (err) {
            setStatusBanner(err.message || "Could not delete screening.");
        }
    };

    const handleCancelEdit = () => {
        setEditingScreeningId(null);
        setScreeningDate(getLocalIsoDate(0));
    };

    const handleTheatreSubmit = async (e) => {
        e.preventDefault();
        if (isSubmittingTheatre) return;

        const payload = {
            name: theatreNameInput.trim(),
            city: theatreCityInput.trim(),
            address: theatreAddressInput.trim(),
        };

        setIsSubmittingTheatre(true);
        try {
            if (editingTheatreId !== null) {
                const updated = await updateAdminTheatre(editingTheatreId, payload);
                await refreshAdminData(updated.city, selectedRoom);
                setEditingTheatreId(null);
                setStatusBanner(`Updated theatre "${updated.name}" (${updated.city}).`);
            } else {
                const created = await createAdminTheatre(payload);
                await refreshAdminData(created.city, selectedRoom);
                setStatusBanner(`Added theatre "${created.name}" (${created.city}).`);
            }
            setTheatreNameInput("");
            setTheatreCityInput("");
            setTheatreAddressInput("");
        } catch (err) {
            setStatusBanner(err.message || "Could not save theatre.");
        } finally {
            setIsSubmittingTheatre(false);
        }
    };

    const handleEditTheatre = (theatre) => {
        setEditingTheatreId(theatre.id);
        setTheatreNameInput(theatre.name);
        setTheatreCityInput(theatre.city);
        setTheatreAddressInput(theatre.address);
    };

    const handleCancelTheatreEdit = () => {
        setEditingTheatreId(null);
        setTheatreNameInput("");
        setTheatreCityInput("");
        setTheatreAddressInput("");
    };

    const handleDeleteTheatre = async (theatre) => {
        try {
            await deleteAdminTheatre(theatre.id);
            await refreshAdminData();
            if (editingTheatreId === theatre.id) {
                handleCancelTheatreEdit();
            }
            setStatusBanner(`Deleted theatre "${theatre.name}".`);
        } catch (err) {
            setStatusBanner(err.message || "Could not delete theatre.");
        }
    };

    const getRoomDraft = (theatreId) => {
        return roomDrafts[theatreId] || { name: "", capacity: "100" };
    };

    const updateRoomDraft = (theatreId, patch) => {
        setRoomDrafts((prev) => ({
            ...prev,
            [theatreId]: {
                ...getRoomDraft(theatreId),
                ...patch,
            },
        }));
    };

    const handleRoomSubmit = async (e, theatre) => {
        e.preventDefault();
        if (submittingRoomTheatreId === theatre.id) return;

        const draft = getRoomDraft(theatre.id);
        const payload = {
            name: draft.name.trim(),
            capacity: Number(draft.capacity),
        };

        setSubmittingRoomTheatreId(theatre.id);
        try {
            if (editingRoomId !== null) {
                const updated = await updateAdminRoom(editingRoomId, payload);
                await refreshAdminData(theatre.city, updated.name);
                setEditingRoomId(null);
                setStatusBanner(
                    `Updated room "${updated.name}" (${updated.capacity} seats) in ${theatre.name}.`,
                );
            } else {
                const created = await createAdminRoom(theatre.id, payload);
                await refreshAdminData(theatre.city, created.name);
                setStatusBanner(
                    `Added room "${created.name}" (${created.capacity} seats) to ${theatre.name}.`,
                );
            }
            setRoomDrafts((prev) => ({
                ...prev,
                [theatre.id]: { name: "", capacity: "100" },
            }));
        } catch (err) {
            setStatusBanner(err.message || "Could not save room.");
        } finally {
            setSubmittingRoomTheatreId(null);
        }
    };

    const handleEditRoom = (theatreId, room) => {
        setEditingRoomId(room.id);
        setRoomDrafts((prev) => ({
            ...prev,
            [theatreId]: {
                name: room.name,
                capacity: String(room.capacity),
            },
        }));
    };

    const handleCancelRoomEdit = (theatreId) => {
        setEditingRoomId(null);
        setRoomDrafts((prev) => ({
            ...prev,
            [theatreId]: { name: "", capacity: "100" },
        }));
    };

    const handleDeleteRoom = async (theatre, room) => {
        try {
            await deleteAdminRoom(room.id);
            await refreshAdminData();
            if (editingRoomId === room.id) {
                setEditingRoomId(null);
            }
            setStatusBanner(`Deleted room "${room.name}" from ${theatre.name}.`);
        } catch (err) {
            setStatusBanner(err.message || "Could not delete room.");
        }
    };

    const canScheduleScreening =
        !isSubmittingScreening &&
        libraryMovies.length > 0 &&
        Boolean(selectedLocation) &&
        availableRoomsForSelectedLocation.length > 0;

    return (
        <div className="admin-page">
            {/* Sticky Section Sub-Bar */}
            <div className="admin-subbar">
                <div className="admin-subbar-inner">
                    <nav className="admin-section-tabs" aria-label="Admin dashboard sections">
                        <button
                            type="button"
                            className={`admin-nav-tab ${activeSection === "sales" ? "active" : ""}`}
                            onClick={() => scrollToSection("sales")}
                        >
                            1. Sales Overview
                        </button>
                        <button
                            type="button"
                            className={`admin-nav-tab ${activeSection === "movies" ? "active" : ""}`}
                            onClick={() => scrollToSection("movies")}
                        >
                            2. Movies &amp; Screenings
                        </button>
                    </nav>

                    <span className="admin-role-badge desktop-only">Owner / Admin</span>
                </div>
            </div>

            <div className="admin-shell">
                {/* Dashboard Hero Heading */}
                <div className="admin-hero">
                    <span className="admin-eyebrow">Admin &amp; owner · v1.0</span>
                    <h1 className="admin-main-title">Rio Cinema dashboard</h1>
                    <p className="admin-main-subtitle">
                        Your daily sales and screening schedule, in one place.
                    </p>
                    <p className="admin-meta-caption">
                        Live database · Today, {formatDateLabel(todayIso)}
                    </p>
                </div>

                {statusBanner && (
                    <div className="admin-notice-banner info" role="status">
                        <span>{statusBanner}</span>
                        <button
                            type="button"
                            className="admin-banner-close"
                            onClick={() => setStatusBanner("")}
                            aria-label="Dismiss notification"
                        >
                            ×
                        </button>
                    </div>
                )}

                {isLoading ? (
                    <p role="status" className="admin-loading">
                        Loading dashboard data...
                    </p>
                ) : (
                    <>
                        {/* SECTION 1: SALES OVERVIEW */}
                        <section
                            ref={salesRef}
                            id="sales-overview"
                            className="admin-section"
                            aria-labelledby="heading-sales-overview"
                        >
                            <h2 id="heading-sales-overview" className="admin-section-title">
                                1. Sales Overview
                            </h2>

                            <div className="admin-filters-row">
                                <div className="admin-field-group">
                                    <label htmlFor="sales-location-filter" className="admin-label">
                                        Location
                                    </label>
                                    <div className="admin-select-wrapper">
                                        <select
                                            id="sales-location-filter"
                                            className="admin-select"
                                            value={locationFilter}
                                            onChange={(e) => setLocationFilter(e.target.value)}
                                        >
                                            <option value="All Locations">All Locations</option>
                                            {locationOptions.map((city) => (
                                                <option key={city} value={city}>
                                                    {city}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown size={16} className="admin-select-icon" />
                                    </div>
                                </div>

                                <div className="admin-field-group">
                                    <label htmlFor="sales-date-filter" className="admin-label">
                                        Date
                                    </label>
                                    <div className="admin-select-wrapper">
                                        <select
                                            id="sales-date-filter"
                                            className="admin-select"
                                            value={dateFilter}
                                            onChange={(e) => setDateFilter(e.target.value)}
                                        >
                                            <option value="today">Today</option>
                                            <option value="tomorrow">
                                                Tomorrow ({formatDateLabel(tomorrowIso)})
                                            </option>
                                            <option value="all">All Dates</option>
                                        </select>
                                        <ChevronDown size={16} className="admin-select-icon" />
                                    </div>
                                </div>
                            </div>

                            <div className="admin-kpi-grid">
                                <article className="admin-kpi-card">
                                    <span className="admin-kpi-label">Daily Ticket Revenue</span>
                                    <p className="admin-kpi-value gold">
                                        {formatCurrency(salesMetrics.totalRevenue)}
                                    </p>
                                    <hr className="admin-card-divider" />
                                    <div className="admin-kpi-breakdown">
                                        {salesMetrics.byCity.map((entry) => (
                                            <span key={entry.city}>
                                                {entry.city}{" "}
                                                <strong>{formatCurrency(entry.revenue)}</strong>
                                            </span>
                                        ))}
                                    </div>
                                </article>

                                <article className="admin-kpi-card">
                                    <span className="admin-kpi-label">Total Seats Sold</span>
                                    <p className="admin-kpi-value">
                                        {salesMetrics.totalSeats} seats
                                    </p>
                                    <hr className="admin-card-divider" />
                                    <div className="admin-kpi-breakdown">
                                        {salesMetrics.byCity.map((entry) => (
                                            <span key={entry.city}>
                                                {entry.city} <strong>{entry.seats} seats</strong>
                                            </span>
                                        ))}
                                    </div>
                                </article>
                            </div>

                            <div className="admin-subsection-header">
                                <h3 className="admin-subsection-title">
                                    Today&apos;s Screenings Performance
                                </h3>
                                <span className="admin-subsection-meta">
                                    {filteredSales.length}{" "}
                                    {filteredSales.length === 1 ? "screening" : "screenings"} ·{" "}
                                    {locationFilter}
                                </span>
                            </div>

                            {/* Desktop Table */}
                            <div className="admin-table-card desktop-only">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Movie Title</th>
                                            <th>Location</th>
                                            <th>Room</th>
                                            <th>Showtime</th>
                                            <th>Seats Sold</th>
                                            <th className="text-right">Screening Revenue</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredSales.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="admin-empty-cell">
                                                    No screenings match the selected filter.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredSales.map((row) => (
                                                <tr key={row.id}>
                                                    <td className="font-semibold">
                                                        {row.movieTitle}
                                                    </td>
                                                    <td>{row.city}</td>
                                                    <td>
                                                        {row.roomName} ({row.capacity} seats)
                                                    </td>
                                                    <td>{row.showtime}</td>
                                                    <td>
                                                        {row.seatsSold} / {row.capacity}
                                                    </td>
                                                    <td className="text-right text-gold font-semibold">
                                                        {formatCurrency(row.revenue)}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td colSpan={4} className="admin-muted-text">
                                                Total across all locations
                                            </td>
                                            <td className="font-bold">
                                                {salesMetrics.totalSeats} seats
                                            </td>
                                            <td className="text-right text-gold font-bold">
                                                {formatCurrency(salesMetrics.totalRevenue)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {/* Mobile Cards */}
                            <div className="admin-mobile-cards mobile-only">
                                {filteredSales.map((row) => (
                                    <article key={row.id} className="admin-mobile-stat-card">
                                        <div className="admin-mobile-card-top">
                                            <h4 className="admin-mobile-card-title">
                                                {row.movieTitle}
                                            </h4>
                                            <span className="text-gold font-semibold">
                                                {row.city}
                                            </span>
                                        </div>
                                        <p className="admin-mobile-card-sub">
                                            {row.roomName} ({row.capacity} seats)
                                        </p>
                                        <hr className="admin-card-divider" />
                                        <div className="admin-mobile-card-metrics">
                                            <div>
                                                <span className="admin-mini-label">Showtime</span>
                                                <p className="admin-mini-value">{row.showtime}</p>
                                            </div>
                                            <div>
                                                <span className="admin-mini-label">Seats Sold</span>
                                                <p className="admin-mini-value">
                                                    {row.seatsSold} / {row.capacity}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="admin-mobile-card-footer">
                                            <span className="admin-mini-label">
                                                Screening Revenue
                                            </span>
                                            <span className="text-gold font-bold">
                                                {formatCurrency(row.revenue)}
                                            </span>
                                        </div>
                                    </article>
                                ))}
                            </div>

                            <p className="admin-footnote">
                                Seat #1 is permanently reserved for the owner in every screening and
                                is not included in seats sold.
                            </p>
                        </section>

                        <hr className="admin-section-divider" />

                        {/* SECTION 2: MOVIES & SCREENINGS */}
                        <section
                            ref={moviesRef}
                            id="movies-screenings"
                            className="admin-section"
                            aria-labelledby="heading-movies-screenings"
                        >
                            <div className="admin-section-intro">
                                <h2 id="heading-movies-screenings" className="admin-section-title">
                                    2. Movies &amp; Screenings
                                </h2>
                                <p className="admin-section-subtitle">
                                    Manage theatres and rooms, import movies, and schedule showtimes.
                                </p>
                            </div>

                            <div className="admin-workspace-grid">
                                {/* Left Panel: Import Movie from OMDb */}
                                <article className="admin-panel-card">
                                    <div className="admin-panel-header">
                                        <h3 className="admin-panel-title">
                                            Import Movie from OMDb
                                        </h3>
                                        <p className="admin-panel-desc">
                                            Preview a movie before adding it to Rio.
                                        </p>
                                    </div>

                                    <div className="admin-search-box">
                                        <Search size={16} className="admin-search-icon" />
                                        <input
                                            type="text"
                                            aria-label="Search OMDb by title or IMDb ID"
                                            placeholder="Search OMDb by title or IMDb ID..."
                                            value={omdbQuery}
                                            onChange={(e) => setOmdbQuery(e.target.value)}
                                        />
                                    </div>

                                    {previewMovie ? (
                                        <>
                                            <div>
                                                <span
                                                    className={`admin-status-pill ${
                                                        isPreviewAlreadyImported
                                                            ? "imported"
                                                            : "pending"
                                                    }`}
                                                >
                                                    {isPreviewAlreadyImported
                                                        ? "Movie preview · In Rio library"
                                                        : "Movie preview · Not imported"}
                                                </span>
                                            </div>

                                            <div className="admin-omdb-preview-card">
                                                <img
                                                    src={previewMovie.posterUrl}
                                                    alt={`${previewMovie.title} poster`}
                                                    className="admin-omdb-poster"
                                                />
                                                <div className="admin-omdb-details">
                                                    <h4 className="admin-omdb-title">
                                                        {previewMovie.title}
                                                    </h4>
                                                    <p className="admin-omdb-meta">
                                                        {previewMovie.releaseYear || "—"}
                                                        {previewMovie.durationMinutes
                                                            ? ` · ${previewMovie.durationMinutes} min`
                                                            : ""}
                                                    </p>
                                                    {previewMovie.directors &&
                                                        previewMovie.directors.length > 0 && (
                                                            <>
                                                                <span className="admin-omdb-role">
                                                                    Director
                                                                </span>
                                                                <p className="admin-omdb-director">
                                                                    {previewMovie.directors.join(
                                                                        ", ",
                                                                    )}
                                                                </p>
                                                            </>
                                                        )}
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="admin-omdb-empty">
                                            {isSearchingOmdb
                                                ? `Searching OMDb for "${cleanedOmdbQuery}"...`
                                                : `No OMDb match for "${omdbQuery}". Try Shang-Chi, Dune, Oppenheimer, or tt9376612.`}
                                        </div>
                                    )}

                                    <p className="admin-panel-hint">
                                        Import saves a local copy in your Rio movie library.
                                    </p>

                                    <button
                                        type="button"
                                        className="admin-btn-primary"
                                        onClick={handleImportMovie}
                                        disabled={!previewMovie}
                                    >
                                        Import to Rio Database
                                    </button>
                                </article>

                                {/* Right Panel: Schedule a screening */}
                                <article ref={scheduleFormRef} className="admin-panel-card">
                                    <div className="admin-panel-header">
                                        <h3 className="admin-panel-title">
                                            {editingScreeningId !== null
                                                ? "Edit scheduled screening"
                                                : "Schedule a screening"}
                                        </h3>
                                        <p className="admin-panel-desc">
                                            Use a movie already saved in your Rio library.
                                        </p>
                                    </div>

                                    <form
                                        className="admin-schedule-form"
                                        onSubmit={handleScheduleSubmit}
                                    >
                                        <div className="admin-field-group">
                                            <label
                                                htmlFor="schedule-movie-select"
                                                className="admin-label"
                                            >
                                                Movie · from Rio library
                                            </label>
                                            <div className="admin-select-wrapper">
                                                <select
                                                    id="schedule-movie-select"
                                                    className="admin-select"
                                                    value={selectedMovieId}
                                                    onChange={(e) =>
                                                        setSelectedMovieId(Number(e.target.value))
                                                    }
                                                >
                                                    {libraryMovies.map((movie) => (
                                                        <option key={movie.id} value={movie.id}>
                                                            {movie.title}
                                                        </option>
                                                    ))}
                                                </select>
                                                <ChevronDown
                                                    size={16}
                                                    className="admin-select-icon"
                                                />
                                            </div>
                                        </div>

                                        <div className="admin-two-col-controls">
                                            <div className="admin-field-group">
                                                <span className="admin-label">Location</span>
                                                {locationOptions.length === 0 ? (
                                                    <p className="admin-panel-hint">
                                                        No locations yet. Add a theatre below.
                                                    </p>
                                                ) : (
                                                    <div
                                                        className="admin-choice-pair"
                                                        role="group"
                                                        aria-label="Location"
                                                    >
                                                        {locationOptions.map((city) => (
                                                            <button
                                                                key={city}
                                                                type="button"
                                                                className={`admin-choice-btn ${
                                                                    selectedLocation === city
                                                                        ? "active"
                                                                        : ""
                                                                }`}
                                                                onClick={() =>
                                                                    handleSelectLocation(city)
                                                                }
                                                            >
                                                                <span className="choice-main">
                                                                    {city}
                                                                </span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="admin-field-group">
                                                <span className="admin-label">Screening Room</span>
                                                {availableRoomsForSelectedLocation.length === 0 ? (
                                                    <p className="admin-panel-hint">
                                                        No rooms yet. Add a room to this theatre below.
                                                    </p>
                                                ) : (
                                                    <div
                                                        className="admin-choice-pair"
                                                        role="group"
                                                        aria-label="Screening Room"
                                                    >
                                                        {availableRoomsForSelectedLocation.map(
                                                            (room) => (
                                                                <button
                                                                    key={room.id || room.name}
                                                                    type="button"
                                                                    className={`admin-choice-btn ${
                                                                        selectedRoom === room.name
                                                                            ? "active"
                                                                            : ""
                                                                    }`}
                                                                    onClick={() =>
                                                                        setSelectedRoom(room.name)
                                                                    }
                                                                >
                                                                    <span className="choice-main">
                                                                        {room.name}
                                                                    </span>
                                                                    <span className="choice-sub">
                                                                        {room.capacity} seats
                                                                    </span>
                                                                </button>
                                                            ),
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="admin-two-col-controls">
                                            <div className="admin-field-group">
                                                <label
                                                    htmlFor="schedule-date-input"
                                                    className="admin-label"
                                                >
                                                    Date
                                                </label>
                                                <input
                                                    id="schedule-date-input"
                                                    type="date"
                                                    className="admin-input"
                                                    value={screeningDate}
                                                    onChange={(e) =>
                                                        setScreeningDate(e.target.value)
                                                    }
                                                    required
                                                />
                                            </div>

                                            <div className="admin-field-group">
                                                <label
                                                    htmlFor="schedule-time-input"
                                                    className="admin-label"
                                                >
                                                    Start Time
                                                </label>
                                                <input
                                                    id="schedule-time-input"
                                                    type="time"
                                                    className="admin-input"
                                                    value={screeningStartTime}
                                                    onChange={(e) =>
                                                        setScreeningStartTime(e.target.value)
                                                    }
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div className="admin-showtime-rules">
                                            <p className="admin-rules-caption">
                                                Doors open 15 min before ads; ads start 12 min
                                                before movie
                                            </p>
                                            <p className="admin-rules-timeline">
                                                Doors {showtimeBreakdown.doors} · Ads{" "}
                                                {showtimeBreakdown.ads} · Movie{" "}
                                                {showtimeBreakdown.movie}
                                            </p>
                                        </div>

                                        <div className="admin-premiere-box">
                                            <div>
                                                <p className="admin-premiere-title">
                                                    {isAutoPremiere
                                                        ? "First Screening Ever (Automatic)"
                                                        : "Standard Screening Pricing"}
                                                </p>
                                                <p className="admin-premiere-sub">
                                                    {isAutoPremiere
                                                        ? "+15% premiere surcharge (€14.95) · No prior screenings in database"
                                                        : "Standard ticket price (€13.00) · Movie already has scheduled screenings"}
                                                </p>
                                            </div>

                                            <span
                                                className={`admin-status-pill ${
                                                    isAutoPremiere ? "pending" : "imported"
                                                }`}
                                            >
                                                {isAutoPremiere ? "+15% Premiere" : "Standard"}
                                            </span>
                                        </div>

                                        <div className="admin-form-actions">
                                            <button
                                                type="submit"
                                                className="admin-btn-primary"
                                                disabled={!canScheduleScreening}
                                            >
                                                {isSubmittingScreening
                                                    ? editingScreeningId !== null
                                                        ? "Saving..."
                                                        : "Scheduling..."
                                                    : editingScreeningId !== null
                                                      ? "Save Screening Changes"
                                                      : "Schedule Screening"}
                                            </button>

                                            {editingScreeningId !== null && (
                                                <button
                                                    type="button"
                                                    className="admin-btn-secondary"
                                                    onClick={handleCancelEdit}
                                                >
                                                    Cancel Edit
                                                </button>
                                            )}
                                        </div>
                                    </form>
                                </article>
                            </div>

                            {/* Theatres & Rooms Management */}
                            <div className="admin-subsection-header">
                                <h3 className="admin-subsection-title">Theatres &amp; Rooms</h3>
                                <span className="admin-subsection-meta">
                                    {theatres.length}{" "}
                                    {theatres.length === 1 ? "theatre" : "theatres"} configured
                                </span>
                            </div>

                            <div className="admin-workspace-grid">
                                <article className="admin-panel-card">
                                    <div className="admin-panel-header">
                                        <h4 className="admin-panel-title">
                                            {editingTheatreId !== null
                                                ? "Edit theatre"
                                                : "Add a theatre"}
                                        </h4>
                                        <p className="admin-panel-desc">
                                            Create cinema locations directly in the database.
                                        </p>
                                    </div>

                                    <form
                                        className="admin-schedule-form"
                                        onSubmit={handleTheatreSubmit}
                                    >
                                        <div className="admin-field-group">
                                            <label
                                                htmlFor="theatre-name-input"
                                                className="admin-label"
                                            >
                                                Theatre Name
                                            </label>
                                            <input
                                                id="theatre-name-input"
                                                type="text"
                                                className="admin-input"
                                                placeholder="e.g. Rio Cinema Oulu"
                                                value={theatreNameInput}
                                                onChange={(e) =>
                                                    setTheatreNameInput(e.target.value)
                                                }
                                                required
                                            />
                                        </div>

                                        <div className="admin-two-col-controls">
                                            <div className="admin-field-group">
                                                <label
                                                    htmlFor="theatre-city-input"
                                                    className="admin-label"
                                                >
                                                    City
                                                </label>
                                                <input
                                                    id="theatre-city-input"
                                                    type="text"
                                                    className="admin-input"
                                                    placeholder="e.g. Oulu"
                                                    value={theatreCityInput}
                                                    onChange={(e) =>
                                                        setTheatreCityInput(e.target.value)
                                                    }
                                                    required
                                                />
                                            </div>

                                            <div className="admin-field-group">
                                                <label
                                                    htmlFor="theatre-address-input"
                                                    className="admin-label"
                                                >
                                                    Street Address
                                                </label>
                                                <input
                                                    id="theatre-address-input"
                                                    type="text"
                                                    className="admin-input"
                                                    placeholder="e.g. Hallituskatu 11"
                                                    value={theatreAddressInput}
                                                    onChange={(e) =>
                                                        setTheatreAddressInput(e.target.value)
                                                    }
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div className="admin-form-actions">
                                            <button
                                                type="submit"
                                                className="admin-btn-primary"
                                                disabled={isSubmittingTheatre}
                                            >
                                                {isSubmittingTheatre
                                                    ? "Saving..."
                                                    : editingTheatreId !== null
                                                      ? "Save Theatre Changes"
                                                      : "Add Theatre"}
                                            </button>

                                            {editingTheatreId !== null && (
                                                <button
                                                    type="button"
                                                    className="admin-btn-secondary"
                                                    onClick={handleCancelTheatreEdit}
                                                >
                                                    Cancel Theatre Edit
                                                </button>
                                            )}
                                        </div>
                                    </form>
                                </article>

                                <div className="admin-theatres-list">
                                    {theatres.length === 0 ? (
                                        <div className="admin-omdb-empty">
                                            No theatres in the database yet. Add your first theatre
                                            on the left, then add screening rooms to it.
                                        </div>
                                    ) : (
                                        theatres.map((theatre) => {
                                            const draft = getRoomDraft(theatre.id);
                                            const isEditingRoomInThisTheatre = (
                                                theatre.rooms || []
                                            ).some((r) => r.id === editingRoomId);

                                            return (
                                                <article
                                                    key={theatre.id}
                                                    className="admin-panel-card"
                                                >
                                                    <div className="admin-theatre-card-head">
                                                        <div>
                                                            <h4 className="admin-panel-title">
                                                                {theatre.name}
                                                            </h4>
                                                            <p className="admin-panel-desc">
                                                                {theatre.city} · {theatre.address}
                                                            </p>
                                                        </div>
                                                        <div className="admin-row-actions">
                                                            <button
                                                                type="button"
                                                                className="admin-action-link edit"
                                                                onClick={() =>
                                                                    handleEditTheatre(theatre)
                                                                }
                                                            >
                                                                Edit Theatre
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="admin-action-link delete"
                                                                onClick={() =>
                                                                    handleDeleteTheatre(theatre)
                                                                }
                                                            >
                                                                Delete Theatre
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {(theatre.rooms || []).length > 0 && (
                                                        <ul className="admin-room-list">
                                                            {theatre.rooms.map((room) => (
                                                                <li
                                                                    key={room.id}
                                                                    className="admin-room-item"
                                                                >
                                                                    <span>
                                                                        <strong>{room.name}</strong>{" "}
                                                                        · {room.capacity} seats
                                                                    </span>
                                                                    <div className="admin-row-actions">
                                                                        <button
                                                                            type="button"
                                                                            className="admin-action-link edit"
                                                                            onClick={() =>
                                                                                handleEditRoom(
                                                                                    theatre.id,
                                                                                    room,
                                                                                )
                                                                            }
                                                                        >
                                                                            Edit Room
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            className="admin-action-link delete"
                                                                            onClick={() =>
                                                                                handleDeleteRoom(
                                                                                    theatre,
                                                                                    room,
                                                                                )
                                                                            }
                                                                        >
                                                                            Delete Room
                                                                        </button>
                                                                    </div>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}

                                                    <form
                                                        className="admin-room-inline-form"
                                                        onSubmit={(e) =>
                                                            handleRoomSubmit(e, theatre)
                                                        }
                                                    >
                                                        <input
                                                            type="text"
                                                            aria-label={`Room name for ${theatre.name}`}
                                                            className="admin-input"
                                                            placeholder="Room name (e.g. Room 1)"
                                                            value={draft.name}
                                                            onChange={(e) =>
                                                                updateRoomDraft(theatre.id, {
                                                                    name: e.target.value,
                                                                })
                                                            }
                                                            required
                                                        />
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            max={5000}
                                                            aria-label={`Seat capacity for ${theatre.name}`}
                                                            className="admin-input"
                                                            placeholder="Seats"
                                                            value={draft.capacity}
                                                            onChange={(e) =>
                                                                updateRoomDraft(theatre.id, {
                                                                    capacity: e.target.value,
                                                                })
                                                            }
                                                            required
                                                        />
                                                        <button
                                                            type="submit"
                                                            className="admin-btn-secondary"
                                                            disabled={
                                                                submittingRoomTheatreId ===
                                                                theatre.id
                                                            }
                                                        >
                                                            {isEditingRoomInThisTheatre
                                                                ? "Save Room"
                                                                : "Add Room"}
                                                        </button>
                                                        {isEditingRoomInThisTheatre && (
                                                            <button
                                                                type="button"
                                                                className="admin-btn-secondary"
                                                                onClick={() =>
                                                                    handleCancelRoomEdit(theatre.id)
                                                                }
                                                            >
                                                                Cancel
                                                            </button>
                                                        )}
                                                    </form>
                                                </article>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* Scheduled Screenings List */}
                            <div className="admin-subsection-header">
                                <h3 className="admin-subsection-title">Scheduled Screenings</h3>
                                <span className="admin-subsection-meta">
                                    {scheduledScreenings.length} upcoming{" "}
                                    {scheduledScreenings.length === 1 ? "screening" : "screenings"}
                                </span>
                            </div>

                            {/* Desktop Table */}
                            <div className="admin-table-card desktop-only">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Movie</th>
                                            <th>Location</th>
                                            <th>Room</th>
                                            <th>Date &amp; Start Time</th>
                                            <th>Premiere</th>
                                            <th className="text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {scheduledScreenings.map((item) => (
                                            <tr key={item.id}>
                                                <td className="font-semibold">{item.movieTitle}</td>
                                                <td>{item.city}</td>
                                                <td>
                                                    {item.roomName} ({item.capacity} seats)
                                                </td>
                                                <td>
                                                    {formatDateLabel(item.date)} · {item.startTime}
                                                </td>
                                                <td>
                                                    {item.isFirstScreening ? (
                                                        <span className="text-gold font-semibold">
                                                            +15% premiere
                                                        </span>
                                                    ) : (
                                                        <span className="admin-muted-text">
                                                            Standard
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="text-right">
                                                    <div className="admin-row-actions">
                                                        <button
                                                            type="button"
                                                            className="admin-action-link edit"
                                                            onClick={() =>
                                                                handleEditScreening(item)
                                                            }
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="admin-action-link delete"
                                                            onClick={() =>
                                                                handleDeleteScreening(
                                                                    item.id,
                                                                    item.movieTitle,
                                                                )
                                                            }
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Cards */}
                            <div className="admin-mobile-cards mobile-only">
                                {scheduledScreenings.map((item) => (
                                    <article key={item.id} className="admin-mobile-stat-card">
                                        <h4 className="admin-mobile-card-title">
                                            {item.movieTitle}
                                        </h4>
                                        <p className="admin-mobile-card-sub">
                                            {item.city} · {item.roomName} ({item.capacity} seats)
                                        </p>
                                        <p className="admin-mobile-card-time">
                                            {formatDateLabel(item.date)} · {item.startTime}
                                        </p>

                                        {item.isFirstScreening && (
                                            <div>
                                                <span className="admin-status-pill pending">
                                                    First Screening Ever · +15%
                                                </span>
                                            </div>
                                        )}

                                        <div className="admin-mobile-action-grid">
                                            <button
                                                type="button"
                                                className="admin-mobile-btn edit"
                                                onClick={() => handleEditScreening(item)}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                className="admin-mobile-btn delete"
                                                onClick={() =>
                                                    handleDeleteScreening(item.id, item.movieTitle)
                                                }
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </section>
                    </>
                )}

                <footer className="admin-footer">
                    <span>Rio Cinema</span>
                    <span>Made for the big screen.</span>
                </footer>
            </div>
        </div>
    );
}
