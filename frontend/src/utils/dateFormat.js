function isValidDateParts(year, month, day) {
    const date = new Date(year, month - 1, day);
    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
}

export function formatDate(value, options = {}) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    let year;
    let month;
    let day;

    if (typeof value === "string") {
        const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

        if (dateOnlyMatch) {
            year = Number(dateOnlyMatch[1]);
            month = Number(dateOnlyMatch[2]);
            day = Number(dateOnlyMatch[3]);

            if (!isValidDateParts(year, month, day)) {
                return null;
            }
        }
    }

    if (year === undefined) {
        const date = value instanceof Date ? value : new Date(value);

        if (Number.isNaN(date.getTime())) {
            return null;
        }

        if (options.timeZone) {
            const dateParts = new Intl.DateTimeFormat("en-GB", {
                timeZone: options.timeZone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
            })
                .formatToParts(date)
                .reduce((parts, part) => {
                    if (part.type !== "literal") {
                        parts[part.type] = part.value;
                    }
                    return parts;
                }, {});

            year = Number(dateParts.year);
            month = Number(dateParts.month);
            day = Number(dateParts.day);
        } else {
            year = date.getFullYear();
            month = date.getMonth() + 1;
            day = date.getDate();
        }
    }

    return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${String(year).padStart(4, "0")}`;
}
