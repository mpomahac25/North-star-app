/* This file will handle the following:
 *  - create and configure express instance
 *  - register and configure middleware and API routes
 *  - configure request validation
 *  - export express app
 */

import express from 'express';

const app = express();
const SERVICE_IDENTIFIER = 'backend';
const MOVIES_API_URL = process.env.MOVIES_API_URL || 'http://localhost:3005';
const COMING_SOON_MOVIES = [
    { title: 'Drive', year: '2011' },
    { title: 'The Nice Guys', year: '2016' },
    { title: 'La La Land', year: '2016' },
    { title: 'Blade Runner 2049', year: '2017' },
    { title: 'The Fall Guy', year: '2024' }
];

app.use(express.json());

app.get('/api/live', (req, res) => {
    res.json({
        status: 'alive',
        service: SERVICE_IDENTIFIER
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: SERVICE_IDENTIFIER
    });
});

app.get('/api/movies/coming-soon', async (req, res) => {
    try {
        const movies = await Promise.all(COMING_SOON_MOVIES.map(async ({ title, year }) => {
            const url = new URL('/api/movies/title', MOVIES_API_URL);
            url.searchParams.set('title', title);
            url.searchParams.set('year', year);

            const response = await fetch(url, {
                signal: AbortSignal.timeout(12000)
            });
            const movie = await response.json();

            if (!response.ok) {
                throw new Error(movie.error || `Movies service returned HTTP ${response.status}.`);
            }

            return {
                imdbId: movie.imdbID,
                title: movie.Title,
                year: movie.Year,
                poster: movie.Poster === 'N/A' ? null : movie.Poster
            };
        }));

        return res.json(movies);
    } catch (error) {
        console.error('Could not load Coming Soon movies:', error);
        return res.status(502).json({
            error: 'Could not load Coming Soon movies from the movies service.'
        });
    }
});

export default app;
