# Changelog

Notable fixes and changes to PATH-CI-PrintingWorkflows, newest first. Each entry links the commit(s) on `Staging-PrintingWorkflows` that shipped it.

## 2026-09-02

### Fixed
- **Stale step counter in the Steps view** — "STEP X OF Y" tracked the lowest-indexed step among everything currently intersecting the viewport, so for tall step cards it could keep showing the previous step well after the user had scrolled into the next one. Now tracks each visible step's intersection ratio and picks whichever is most visible, matching the approach already used in `PATH-CI-Apparel`. (`fa24d72`)
- **`seed-admins.js` targeted the wrong Firestore database** — used `getFirestore(app)`, which always resolves to the `"(default)"` database, while the app itself (`lib/firebase-admin.ts`) reads/writes a named database via `FIREBASE_DATABASE_ID`/`FIREBASE_ADMIN_DATABASE_ID`. Admins seeded by the script landed somewhere the app never checked. Now uses the same env-var fallback pattern as `lib/firebase-admin.ts`. (`b2b72dd`)
- **Duplicated site title in screen-reader navigation announcements** — `document.title` was built as `` `${currentPageName} · ${homepageTitle}` `` on every in-app navigation. On the home page this produced a literal duplicate ("Welcome · Welcome"), since the page name and the site title are the same value there; deeper pages had the site name appended on every navigation. Title is now just the current page name. (`5ddbe15`)
