import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import {
    createAdminScreening,
    deleteAdminScreening,
    fetchAdminDashboardInitialData,
    importMovieFromOmdb,
    updateAdminScreening,
} from "../api";
import "./AdminPage.css";

const ROOM_OPTIONS = [
    { name: "Room 1", capacity: 100 },
    { name: "Room 2", capacity: 200 },
];

const LOCATION_OPTIONS = ["Oulu", "Tampere"];

function formatCurrency(amount) {
    return `€${Number(amount).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function formatDateLabel(isoDate) {
    if (isoDate === "2026-11-16") {
        return "Today";
    }

    const [year, month, day] = isoDate.split("-");
    const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    if (!year || !month || !day) {
        return isoDate;
    }

    return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
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
    const [selectedMovieId, setSelectedMovieId] = useState(1);
    const [selectedLocation, setSelectedLocation] = useState("Oulu");
    const [selectedRoom, setSelectedRoom] = useState("Room 1");
    const [screeningDate, setScreeningDate] = useState("2026-11-16");
    const [screeningStartTime, setScreeningStartTime] = useState("18:00");
    const [isFirstScreening, setIsFirstScreening] = useState(false);

    const salesRef = useRef(null);
    const moviesRef = useRef(null);
    const scheduleFormRef = useRef(null);

    useEffect(() => {
        let isMounted = true;

        async function loadAdminData() {
            try {
                const data = await fetchAdminDashboardInitialData();
                if (!isMounted) return;

                setLibraryMovies(data.libraryMovies);
                setOmdbCatalog(data.omdbCatalog);
                setSalesScreenings(data.salesScreenings);
                setScheduledScreenings(data.scheduledScreenings);

                if (data.libraryMovies.length > 0) {
                    setSelectedMovieId(data.libraryMovies[0].id);
                }
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

        const ouluRevenue = filteredSales
            .filter((s) => s.city === "Oulu")
            .reduce((sum, s) => sum + s.revenue, 0);
        const tampereRevenue = filteredSales
            .filter((s) => s.city === "Tampere")
            .reduce((sum, s) => sum + s.revenue, 0);

        const ouluSeats = filteredSales
            .filter((s) => s.city === "Oulu")
            .reduce((sum, s) => sum + s.seatsSold, 0);
        const tampereSeats = filteredSales
            .filter((s) => s.city === "Tampere")
            .reduce((sum, s) => sum + s.seatsSold, 0);

        return {
            totalRevenue,
            totalSeats,
            ouluRevenue,
            tampereRevenue,
            ouluSeats,
            tampereSeats,
        };
    }, [filteredSales]);

    const previewMovie = useMemo(() => {
        const cleaned = omdbQuery.trim().toLowerCase();
        if (!cleaned) {
            return omdbCatalog[0] || null;
        }

        return (
            omdbCatalog.find(
                (movie) =>
                    movie.title.toLowerCase().includes(cleaned) ||
                    (movie.imdbId && movie.imdbId.toLowerCase().includes(cleaned)),
            ) || null
        );
    }, [omdbCatalog, omdbQuery]);

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

        const savedMovie = await importMovieFromOmdb(previewMovie);
        setLibraryMovies((prev) => [...prev, savedMovie]);
        setSelectedMovieId(savedMovie.id);
        setStatusBanner(`Imported "${savedMovie.title}" into Rio Database.`);
    };

    const handleScheduleSubmit = async (e) => {
        e.preventDefault();

        const chosenMovie = libraryMovies.find((m) => m.id === Number(selectedMovieId));
        const chosenRoom = ROOM_OPTIONS.find((r) => r.name === selectedRoom) || ROOM_OPTIONS[0];

        if (!chosenMovie) return;

        const payload = {
            movieId: chosenMovie.id,
            movieTitle: chosenMovie.title,
            city: selectedLocation,
            roomName: chosenRoom.name,
            capacity: chosenRoom.capacity,
            date: screeningDate,
            startTime: screeningStartTime,
            isFirstScreening,
        };

        if (editingScreeningId !== null) {
            const updated = await updateAdminScreening(editingScreeningId, payload);
            setScheduledScreenings((prev) =>
                prev.map((item) => (item.id === editingScreeningId ? updated : item)),
            );
            setEditingScreeningId(null);
            setStatusBanner(
                `Updated screening for "${chosenMovie.title}" in ${selectedLocation} (${chosenRoom.name}). Seat #1 remains reserved for owner.`,
            );
        } else {
            const created = await createAdminScreening(payload);
            setScheduledScreenings((prev) => [...prev, created]);
            setStatusBanner(
                `Scheduled "${chosenMovie.title}" in ${selectedLocation} (${chosenRoom.name}) at ${screeningStartTime}. Seat #1 permanently reserved for owner.`,
            );
        }
    };

    const handleEditScreening = (screening) => {
        setEditingScreeningId(screening.id);
        setSelectedMovieId(screening.movieId);
        setSelectedLocation(screening.city);
        setSelectedRoom(screening.roomName);
        setScreeningDate(screening.date);
        setScreeningStartTime(screening.startTime);
        setIsFirstScreening(Boolean(screening.isFirstScreening));
        scheduleFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    const handleCancelEdit = () => {
        setEditingScreeningId(null);
        setIsFirstScreening(false);
    };

    const handleDeleteScreening = async (id, title) => {
        await deleteAdminScreening(id);
        setScheduledScreenings((prev) => prev.filter((item) => item.id !== id));
        if (editingScreeningId === id) {
            setEditingScreeningId(null);
        }
        setStatusBanner(`Removed screening for "${title}".`);
    };

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
                    <p className="admin-meta-caption">Example data · Today, 16 Nov 2026</p>
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
                                            <option value="Oulu">Oulu</option>
                                            <option value="Tampere">Tampere</option>
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
                                            <option value="tomorrow">Tomorrow (17 Nov)</option>
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
                                        <span>
                                            Oulu <strong>{formatCurrency(salesMetrics.ouluRevenue)}</strong>
                                        </span>
                                        <span>
                                            Tampere <strong>{formatCurrency(salesMetrics.tampereRevenue)}</strong>
                                        </span>
                                    </div>
                                </article>

                                <article className="admin-kpi-card">
                                    <span className="admin-kpi-label">Total Seats Sold</span>
                                    <p className="admin-kpi-value">
                                        {salesMetrics.totalSeats} seats
                                    </p>
                                    <hr className="admin-card-divider" />
                                    <div className="admin-kpi-breakdown">
                                        <span>
                                            Oulu <strong>{salesMetrics.ouluSeats} seats</strong>
                                        </span>
                                        <span>
                                            Tampere <strong>{salesMetrics.tampereSeats} seats</strong>
                                        </span>
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
                                                    <td className="font-semibold">{row.movieTitle}</td>
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
                                                Total across both locations
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
                                Seat #1 is permanently reserved for the owner in every screening and is not included in seats sold.
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
                                    Find a movie. Choose a room. Set the start time.
                                </p>
                            </div>

                            <div className="admin-workspace-grid">
                                {/* Left Panel: Import Movie from OMDb */}
                                <article className="admin-panel-card">
                                    <div className="admin-panel-header">
                                        <h3 className="admin-panel-title">Import Movie from OMDb</h3>
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
                                                        isPreviewAlreadyImported ? "imported" : "pending"
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
                                                        {previewMovie.releaseYear} ·{" "}
                                                        {previewMovie.durationMinutes} min
                                                    </p>
                                                    <span className="admin-omdb-role">Director</span>
                                                    <p className="admin-omdb-director">
                                                        {previewMovie.directors.join(", ")}
                                                    </p>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="admin-omdb-empty">
                                            No OMDb match for &ldquo;{omdbQuery}&rdquo;. Try Shang-Chi, Dune, Oppenheimer, or tt9376612.
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

                                    <form className="admin-schedule-form" onSubmit={handleScheduleSubmit}>
                                        <div className="admin-field-group">
                                            <label htmlFor="schedule-movie-select" className="admin-label">
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
                                                <ChevronDown size={16} className="admin-select-icon" />
                                            </div>
                                        </div>

                                        <div className="admin-two-col-controls">
                                            <div className="admin-field-group">
                                                <span className="admin-label">Location</span>
                                                <div
                                                    className="admin-choice-pair"
                                                    role="group"
                                                    aria-label="Location"
                                                >
                                                    {LOCATION_OPTIONS.map((city) => (
                                                        <button
                                                            key={city}
                                                            type="button"
                                                            className={`admin-choice-btn ${
                                                                selectedLocation === city ? "active" : ""
                                                            }`}
                                                            onClick={() => setSelectedLocation(city)}
                                                        >
                                                            <span className="choice-main">{city}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="admin-field-group">
                                                <span className="admin-label">Screening Room</span>
                                                <div
                                                    className="admin-choice-pair"
                                                    role="group"
                                                    aria-label="Screening Room"
                                                >
                                                    {ROOM_OPTIONS.map((room) => (
                                                        <button
                                                            key={room.name}
                                                            type="button"
                                                            className={`admin-choice-btn ${
                                                                selectedRoom === room.name ? "active" : ""
                                                            }`}
                                                            onClick={() => setSelectedRoom(room.name)}
                                                        >
                                                            <span className="choice-main">{room.name}</span>
                                                            <span className="choice-sub">
                                                                {room.capacity} seats
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="admin-two-col-controls">
                                            <div className="admin-field-group">
                                                <label htmlFor="schedule-date-input" className="admin-label">
                                                    Date
                                                </label>
                                                <input
                                                    id="schedule-date-input"
                                                    type="date"
                                                    className="admin-input"
                                                    value={screeningDate}
                                                    onChange={(e) => setScreeningDate(e.target.value)}
                                                    required
                                                />
                                            </div>

                                            <div className="admin-field-group">
                                                <label htmlFor="schedule-time-input" className="admin-label">
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
                                                Doors open 15 min before ads; ads start 12 min before movie
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
                                                    First Screening Ever
                                                </p>
                                                <p className="admin-premiere-sub">
                                                    +15% premiere surcharge
                                                </p>
                                            </div>

                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={isFirstScreening}
                                                aria-label="First Screening Ever +15% premiere surcharge"
                                                className={`admin-switch ${
                                                    isFirstScreening ? "checked" : ""
                                                }`}
                                                onClick={() =>
                                                    setIsFirstScreening((prev) => !prev)
                                                }
                                            >
                                                <span className="admin-switch-thumb" />
                                            </button>
                                        </div>

                                        <div className="admin-form-actions">
                                            <button
                                                type="submit"
                                                className="admin-btn-primary"
                                            >
                                                {editingScreeningId !== null
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
                                                        <span className="admin-muted-text">Standard</span>
                                                    )}
                                                </td>
                                                <td className="text-right">
                                                    <div className="admin-row-actions">
                                                        <button
                                                            type="button"
                                                            className="admin-action-link edit"
                                                            onClick={() => handleEditScreening(item)}
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