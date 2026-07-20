# Repository Guidelines

## Project Structure & Module Organization

OpenCut React is a React 19 and TypeScript video-timeline component library. Public exports live in `src/index.ts` and `src/library-entry.ts`. The editor implementation is under `src/editor/`: UI components are in `components/`, timeline interactions in `timeline/`, state management in `store/`, media loading in `media/`, and pure timeline logic in `core/`. The runnable Vite example is in `src/demo/`, shared test setup is in `src/test/`, and documentation images are stored in `doc-image/`. Tests are colocated as `*.test.ts` or `*.test.tsx`. Treat `dist/` and `demo-dist/` as generated output.

## Build, Test, and Development Commands

Use Node.js `^20.19.0` or `>=22.12.0` (Node 22 is recommended).

- `npm ci` installs the exact locked dependencies.
- `npm run dev` starts the Vite demo development server.
- `npm run lint` checks TypeScript and React rules with ESLint.
- `npm run typecheck` runs strict TypeScript checks without emitting files.
- `npm run test` runs the Vitest suite once; `npm run test:watch` is for local iteration.
- `npm run build` validates types and builds both the library and demo.
- `npm run preview` serves the generated demo from `demo-dist/`.

Before opening a pull request, run the same verification sequence as CI: lint, typecheck, test, then build.

## Coding Style & Naming Conventions

Follow existing TypeScript/TSX style: two-space indentation, single quotes, semicolons, trailing commas, named exports, and strict typing. Use `PascalCase` for React components and types, `camelCase` for functions and values, and kebab-case utility filenames such as `timeline-layout.ts`. Keep CSS selectors within the existing `oc-` namespace. Make focused changes and avoid compatibility layers when a clean replacement is requested. Do not hand-edit generated bundles.

## Testing Guidelines

Tests use Vitest, jsdom, React Testing Library, `user-event`, and `jest-dom`. Place tests beside the behavior they cover and describe outcomes rather than implementation details. Prefer accessible queries (`getByRole`, `getByLabelText`) and user-visible assertions. Add regression coverage for timeline math, store transitions, media behavior, and editor interactions affected by a change.

## Commit & Pull Request Guidelines

Recent commits use short, descriptive Chinese summaries without Conventional Commit prefixes; keep each commit scoped to one behavior. Pull requests should explain the user-visible result, identify risky timeline or media changes, link relevant issues, and include screenshots or recordings for visual changes. Confirm all CI commands pass and avoid committing unrelated generated artifacts.
