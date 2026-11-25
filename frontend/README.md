# React + Vite

## End-to-end tests

Playwright starts the frontend, backend, and login service on ports `3100`,
`3101`, and `3103`. Authentication E2E tests use the real services and a
dedicated PostgreSQL database named `rio_e2e_test`; they never use
`rio_theaters`. The database connection uses `POSTGRES_USER`,
`POSTGRES_PASSWORD`, and `POSTGRES_HOST_PORT` from the root `.env` file.

With the project PostgreSQL container running, create and migrate the E2E
database once (replace `rio` if `POSTGRES_USER` has a different value):

```powershell
docker compose exec postgres psql -U rio -d postgres -c "CREATE DATABASE rio_e2e_test;"
docker compose --profile tools run --rm -e FLYWAY_URL=jdbc:postgresql://postgres:5432/rio_e2e_test flyway migrate
pnpm --dir frontend test:e2e
```

The test account created by the auth flow is removed after its test. Google
OAuth is not contacted by these tests.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
