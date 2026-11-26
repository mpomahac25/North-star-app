# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## End-to-end tests

The Playwright suite can run without a database for its mocked UI scenarios. To run the full-stack registration scenario, set `DB_TEST_URL` to a disposable PostgreSQL database on `localhost` or `127.0.0.1` whose name ends in `_test`, set `EMAIL_E2E_TO` to a deliverable test mailbox, configure Gmail credentials in the login service environment, then apply the migrations from `db/migrations`. With either `DB_TEST_URL` or `EMAIL_E2E_TO` unset, the full-stack scenario is skipped.
