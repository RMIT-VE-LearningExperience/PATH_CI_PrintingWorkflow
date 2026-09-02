# Accessibility audit report

Audit date: 2 September 2026  
Target: local Next.js front end at `http://localhost:3000`  
Standard used: WCAG 2.2 Level AA  

> **Re-audit, 2 September 2026 (post-remediation):** findings A4–A10 have
> been fixed on the `Staging-PrintingWorkflows` branch (commits `7ba8324`
> through `e5883ff`). Lighthouse accessibility now scores **100 with no
> failing audits on all four audited views** (raw reports:
> `lighthouse-*-reaudit.json`). See the status table at the end of this
> document. Still open: A1, A2 (admin UI, deferred), A3 (conditional —
> no direct video in content yet), A11 (advisory).

## Executive summary

The public guide has a solid accessibility foundation, but the application is not yet ready for a WCAG 2.2 AA conformance claim. Automated public-page scores ranged from 95 to 98. The main public issues are incorrect heading structure, one small-text contrast failure, incomplete modal semantics, missing page landmarks on utility routes, and incomplete tab semantics on login.

The largest risk is in the authenticated admin UI. Source review found multiple controls that are mouse-only and multiple icon-only controls without accessible names. These prevent keyboard and screen-reader users from completing core content-management tasks.

This is an engineering audit, not a formal third-party conformance certification. The authenticated admin UI could not be rendered because no test credentials were supplied; those findings are source-verified but were not exercised in-browser.

## Scope and method

- Lighthouse accessibility audits on the homepage, a complete four-step guide, login, and the not-found route.
- Browser accessibility-tree inspection and keyboard interaction with Playwright.
- Modal open/close, focus trapping, Escape dismissal, and focus return.
- Mobile reflow inspection at 320 by 568 CSS pixels.
- Source review of the public guide, login, not-found route, admin dashboard, sidebar, dialogs, images, and video handling.
- `npm run lint` completed with no warnings or errors.

Not covered: authenticated end-to-end admin flows, VoiceOver/NVDA/JAWS testing, browser zoom at 200% and 400%, forced-colors/high-contrast mode, user-generated media caption quality, and cognitive usability testing with participants.

## Automated results

| View | Lighthouse accessibility score | Automated failures |
|---|---:|---|
| Homepage | 98 | Heading order |
| Four-step guide | 95 | Heading order; text contrast |
| Login | 98 | No `main` landmark |
| Not found | 98 | No `main` landmark |

Raw reports are stored beside this report as `lighthouse-home.json`, `lighthouse-steps.json`, `lighthouse-login.json`, and `lighthouse-notfound.json`.

## Findings

### A1 — High: Core admin interactions are not keyboard operable

WCAG: 2.1.1 Keyboard (Level A), 4.1.2 Name, Role, Value (Level A)

Evidence:

- Item rows navigate through `TableRow onClick` but are not focusable and have no keyboard handler: `app/admin/AdminDashboard.tsx:723-731`.
- Sortable table headers use `TableCell onClick` rather than a button or `TableSortLabel`: `app/admin/AdminDashboard.tsx:854-859` and `871-877`.
- Collapsed-sidebar items use a generic `Box onClick`: `app/admin/Sidebar.tsx:213-218`.
- Search/create accordion headers are generic clickable boxes with no keyboard operation or expanded state: `app/admin/dialogs/SearchLinkDialog.tsx:124-132` and `185-196`.

Impact: keyboard, switch-control, and voice-input users cannot reliably navigate items, sort tables, or operate key dialog sections.

Fix:

- Use native `button` or link elements for navigation and disclosure controls.
- Use MUI `TableSortLabel` inside table headers and expose `aria-sort`.
- Give disclosures `aria-expanded` and `aria-controls`.
- If an entire row remains clickable, include a real link/button in the first cell as the primary action; do not make the row itself the only target.

### A2 — High: Admin icon controls lack accessible names

WCAG: 4.1.2 Name, Role, Value (Level A), 2.4.6 Headings and Labels (Level AA)

Evidence:

- Row menu/share buttons have no `aria-label`: `app/admin/AdminDashboard.tsx:775-805`.
- Statistics and sign-out icon buttons rely on visual tooltips: `app/admin/AdminDashboard.tsx:1521-1529`.
- Collapsed sidebar icon buttons lack programmatic names: `app/admin/Sidebar.tsx:165-205`.
- Upload, clear-image, and crop-reset icon buttons lack task-specific names: `app/admin/dialogs/AddEditItemDialog.tsx:137-186`, `app/admin/dialogs/AddEditStepDialog.tsx:191-240`, and `app/admin/dialogs/ImageCropDialog.tsx:287-290`.
- The publication switch has no item-specific accessible label: `app/admin/AdminDashboard.tsx:818-824`.

Impact: screen-reader and voice-input users encounter unnamed controls such as “button” and cannot determine their purpose.

Fix: add explicit, contextual names such as `aria-label={\`More actions for ${item.name}\`}`, `aria-label={\`Copy link for ${item.name}\`}`, `aria-label="Upload thumbnail"`, `aria-label="Remove step image"`, and `inputProps={{ "aria-label": \`Publish ${item.name}\` }}`. Keep tooltips as visual help, not as the only label.

### A3 — High, conditional: Direct video has no caption or description track

WCAG: 1.2.2 Captions (Prerecorded), 1.2.5 Audio Description (Prerecorded)

Evidence: direct MP4/WebM/Ogg rendering includes only a `<source>` element at `app/components/PublicApp.tsx:1177-1181`; the admin preview does the same at `app/admin/AdminDashboard.tsx:1025`.

Impact: if uploaded videos contain speech or meaningful visual-only instructions, deaf/hard-of-hearing and blind/low-vision users miss essential content.

Fix: extend the content model to require WebVTT caption and audio-description/alternative-transcript assets where applicable, render `<track kind="captions">`, and prevent publication of instructional videos until required alternatives are present. This finding is conditional because the audited guide state did not expose a direct video.

### A4 — Medium: Heading hierarchy skips multiple levels

WCAG: 1.3.1 Info and Relationships, 2.4.6 Headings and Labels

Evidence:

- Homepage cards use `h6` immediately after the page `h1`: `app/components/PublicApp.tsx:314-319` and `341-346`.
- Nested and step views begin with `h2`, then step/card headings use `h6`: `app/components/PublicApp.tsx:972-977`, `1117-1122`, and `1155-1158`.
- Lighthouse reproduced this on the homepage and complete guide.

Impact: heading navigation gives screen-reader users a misleading document outline and makes sections harder to scan.

Fix: use one `h1` for each view's title. Use `h2` for cards/steps under that title, or `h3` only when genuinely nested under an `h2`. Keep MUI visual styling independent with `variant` plus `component`.

### A5 — Medium: The image viewer is not exposed as a named dialog

WCAG: 1.3.1 Info and Relationships, 4.1.2 Name, Role, Value, 1.1.1 Non-text Content

Evidence:

- The accessibility tree exposes the open viewer as a generic container rather than a dialog.
- The modal content has no dialog role/name and no visible close button: `app/components/PublicApp.tsx:1211-1251`.
- The enlarged image always uses `alt="Step image"`, discarding the original descriptive alternative: `app/components/PublicApp.tsx:1221-1225`.

Positive behavior: focus moved into the modal, was trapped, Escape closed it, and focus returned to the invoking image button.

Fix: use MUI `Dialog`/`DialogContent` or add `role="dialog"`, `aria-modal="true"`, and an accessible name. Add a visible Close button. Store the selected image URL and alt text together so the enlarged image retains its original description.

### A6 — Medium: Guide context text narrowly fails minimum contrast

WCAG: 1.4.3 Contrast (Minimum)

Evidence: Lighthouse measured the 12px breadcrumb/context text (`#3D8078` on `#FDF9F1`) at 4.38:1; 4.5:1 is required for normal text. The repeated styling is at `app/components/PublicApp.tsx:957-959`, `1046-1048`, and `1094-1096`.

Fix: darken the foreground, for example to a verified darker teal, or increase the rendered text size/weight enough to qualify as large text. Re-test the exact computed colors after the change.

### A7 — Medium: Login and not-found pages have no main landmark

WCAG: 1.3.1 Info and Relationships, 2.4.1 Bypass Blocks

Evidence:

- Lighthouse reported no `main` landmark on both routes.
- Login root is a generic `Box`: `app/login/page.tsx:124-133`.
- Not-found root is a generic `Box`: `app/not-found.tsx:7-16`.

Fix: render the root content wrapper as `<main>` (`component="main"`) and make the visible page heading an `h1`.

### A8 — Medium: Login tabs are not programmatically connected to tab panels

WCAG: 1.3.1 Info and Relationships, 4.1.2 Name, Role, Value

Evidence: the browser tree exposes a `tablist` and two tabs, but the content is a generic container with no `tabpanel`; tabs have no `aria-controls`: `app/login/page.tsx:144-159`.

Fix: give each tab an ID and `aria-controls`; render each content section with `role="tabpanel"`, `id`, and `aria-labelledby`. Add an accessible label to the tab list such as “Admin access”.

### A9 — Medium: Utility-route page titles do not describe the page

WCAG: 2.4.2 Page Titled (Level A)

Evidence: `/login` and the not-found route both retain the generic title “Printer Workflows”, while public guide navigation correctly updates titles.

Fix: add route metadata such as “Admin login · Printer Workflows” and “Page not found · Printer Workflows”.

### A10 — Low: Step progress updates are visual-only

WCAG: 4.1.3 Status Messages

Evidence: the sticky “STEP x OF y” text changes as the intersection observer updates `activeStepIndex`, but it is not a live region: `app/components/PublicApp.tsx:1123-1128`.

Impact: screen-reader users are not notified when the current visual step changes during scrolling or focus movement.

Fix: expose the current step with a restrained `role="status"`/`aria-live="polite"`, or provide a separate visually-hidden status message. Avoid announcing repeatedly during ordinary scroll jitter.

### A11 — Advisory: Motion has no reduced-motion override

The UI uses smooth scrolling, transforms, and transitions but has no `prefers-reduced-motion` handling. WCAG 2.3.3 is AAA, so this is not an AA blocker, but it is a worthwhile inclusive-design improvement. Disable smooth scrolling and nonessential transforms/transitions when reduced motion is requested.

## Confirmed strengths

- The document language is set to English.
- Public guide views have one main landmark and a visible-on-focus skip link.
- SPA navigation updates the document title and moves focus to main content.
- Public navigation and image-enlarge controls use native buttons with accessible names.
- Image viewer focus trapping, Escape dismissal, and focus restoration work.
- Footer link text is descriptive.
- The guide reflows cleanly at 320px with no observed horizontal clipping.
- Touch targets for major public icon controls and zoom controls are approximately 44px or larger.
- Form inputs on login have programmatic labels, and MUI tabs support expected arrow-key behavior.

## Remediation order

1. Replace mouse-only admin controls with native keyboard-operable elements.
2. Name every admin icon button and status switch.
3. Correct public heading levels and route-level `h1` usage.
4. Rebuild the image viewer as a named dialog with a Close button and retained alt text.
5. Fix the teal-on-cream contrast failure.
6. Add main landmarks, route-specific titles, and complete tab-panel semantics to login/not-found.
7. Add a caption/transcript workflow before publishing direct video.
8. Add regression coverage with axe/Lighthouse for public routes and authenticated Playwright fixtures for admin flows.

## Suggested acceptance criteria

- Lighthouse accessibility score is 100 on all audited public routes with no failing axe rules.
- Every admin action is reachable and operable with Tab, Shift+Tab, Enter, Space, and arrow keys where the widget pattern requires them.
- Every interactive element has a unique, task-specific accessible name.
- The image viewer announces as a modal dialog, includes a visible close control, traps focus, closes on Escape, and returns focus.
- The rendered heading outline has one `h1` and no skipped levels.
- All normal text meets at least 4.5:1 contrast and non-text UI boundaries meet at least 3:1 where required.
- Layout remains usable at 320 CSS pixels and at 200%/400% browser zoom.
- Direct instructional video cannot be published without required captions and equivalent alternatives.

## Remediation status — re-audit of 2 September 2026

Lighthouse accessibility re-run on the same four views after the fixes
landed on `Staging-PrintingWorkflows`:

| View | Before | After | Failing audits after |
|---|---:|---:|---|
| Homepage | 98 | **100** | none |
| Four-step guide | 95 | **100** | none |
| Login | 98 | **100** | none |
| Not found | 98 | **100** | none |

Per-finding status:

| Finding | Status | Commit |
|---|---|---|
| A1 — Admin keyboard operability | Open (deferred by owner) | — |
| A2 — Admin icon control names | Open (deferred by owner) | — |
| A3 — Video captions | Open (conditional; no direct video in content) | — |
| A4 — Heading hierarchy | **Fixed** — one h1 per view, no skipped levels, visuals unchanged | `e0b656b` |
| A5 — Image viewer dialog | **Fixed** — named dialog, retained alt text, visible Close button; also now fits the viewport at 100% zoom | `7ba8324`, `01c6836` |
| A6 — Small-text contrast | **Fixed** — dedicated `primaryText` token (#38756E, 5.08:1) for small text on the cream background | `cb99bd6` |
| A7 — Main landmarks | **Fixed** — login, not-found route, and the catch-all route's inline 404 view (the 404 users actually reach) | `240e8ad` |
| A8 — Login tab semantics | **Fixed** — labelled tab list, aria-controls, tabpanel roles | `240e8ad` |
| A9 — Utility page titles | **Fixed** — "Admin login · …" via route metadata; the inline 404 sets "Page not found · …" | `240e8ad` |
| A10 — Step progress announcements | **Fixed** — visually hidden role="status" region, debounced 800ms against scroll jitter | `e5883ff` |
| A11 — Reduced motion | Open (advisory, AAA) | — |

Verification for the fixes was in-browser (Puppeteer against the running
app): accessibility-tree dialog name and alt retention, heading outlines
per view, computed contrast of the rendered caption, landmark/title/tab
wiring on login and the real 404 path, and the debounce behaviour of the
status region. Public-view screenshots before and after the heading
change were pixel-identical.
