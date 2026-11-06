cd \services\movies
pnpm dev

Health-check:
http://localhost:3005/api/health
Search by id:
http://localhost:3005/api/movies/tt0780504
Search by title:
http://localhost:3005/api/movies/title?title=Drive
Search by title&year:
http://localhost:3005/api/movies/title?title=Drive&year=2011
Non-strict search by title&type
http://localhost:3005/api/movies/search?q=Drive&type=movie
