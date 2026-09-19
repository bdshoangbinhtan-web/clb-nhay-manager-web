# ABK Mobile UI — Foundation Report

## 1. Executive summary

This change establishes a safe, mobile-first presentation layer for Angel BK Manager without changing database structures, Supabase functions, authentication, calculations, or business rules. It adds reusable ABK Mobile UI primitives, a role-aware five-destination bottom navigation, and a mobile-only Dashboard organized around “what needs attention now.” The existing desktop sidebar and full desktop Dashboard remain intact.

## 2. Existing mobile UX problems discovered

- Mobile navigation depended on opening a desktop-style drawer, so common destinations were not continuously visible or one-handed.
- The Dashboard used the same long, chart/KPI-oriented content hierarchy on every viewport. Operational items were mixed with monthly analysis, branch summaries, financial summaries, activity feeds, and quick actions.
- Cards, row radii, shadows, spacing, and action treatments varied widely. Global CSS also applied decorative hover/3D behavior broadly inside `main`, including patterns that are less useful on touch screens.
- Normal loading frequently used text such as “Đang tải...” inside an otherwise empty region rather than a shape-stable placeholder.
- Several empty states were passive messages without a consistent title/description/action hierarchy.
- Existing centered modals are desktop-oriented; there was no reusable mobile sheet pattern for future filters or quick actions.
- Several screens use wide tables and dense toolbars on small viewports. Those screens were deliberately not migrated in this task.
- Multiple actions on the Dashboard had similar visual weight, making the next operational action less obvious.
- Some mobile inputs inherited small text sizes that can trigger browser zoom and make touch entry uncomfortable.
- The Dashboard search was instant, but its text was lost when the Dashboard unmounted.

## 3. ABK Mobile UI principles established

- One mobile screen has one obvious operational goal.
- Place today’s work and attention items before analysis.
- Use a persistent maximum-five destination navigation for frequent work.
- Use compact, full-row tap targets for lists and keep targets at least approximately 44px.
- Use sheets for safe, short mobile choices; retain deliberate confirmation for dangerous work.
- Keep motion short and functional, and honor reduced-motion preferences.
- Keep desktop presentation separate where density and tables are valuable.
- Reuse existing data and calculations; presentation must not invent business metrics.

## 4. Reusable components and tokens created

`components/ui/mobile-ui.tsx` provides:

- `MobilePageShell`
- `MobilePageHeader`
- `MobileListRow`
- `BottomSheet`
- `Skeleton`
- `EmptyState`
- `InlineState` for success and error feedback
- `PrimaryBottomAction`
- `FilterChip`
- `ConfirmationPanel`

`app/globals.css` adds shared spacing/touch tokens, focus visibility, mobile cards and rows, safe-area-aware navigation/action positioning, sheet transitions, skeleton animation, reduced-motion handling, and 16px mobile form controls.

## 5. Every file changed

1. `app/dashboard/page.tsx`
2. `app/globals.css`
3. `components/layout/app-shell.tsx`
4. `components/layout/mobile-bottom-nav.tsx` (new)
5. `components/ui/mobile-ui.tsx` (new)
6. `ABK_MOBILE_UI_REPORT.md` (new)

## 6. Why each file was changed

- `app/dashboard/page.tsx`: adds a focused mobile Dashboard while preserving the existing desktop Dashboard and every existing query/calculation. It also safely preserves Dashboard search text in session storage.
- `app/globals.css`: defines the small ABK Mobile UI visual/ergonomic foundation and safe-area behavior without adding a dependency.
- `components/layout/app-shell.tsx`: mounts mobile navigation and reserves sufficient bottom space so fixed navigation cannot cover content.
- `components/layout/mobile-bottom-nav.tsx`: implements role-aware mobile primary navigation and the “More” bottom sheet.
- `components/ui/mobile-ui.tsx`: provides reusable mobile patterns for later module migration.
- `ABK_MOBILE_UI_REPORT.md`: records scope, findings, validation, exclusions, and recommended next steps.

## 7. Mobile navigation changes

- Admin/manager primary destinations are Home, Students, Attendance, Tuition, and More.
- More exposes branches/classes, teachers, payroll, expenses, other revenue, reports, trial registrations/students, settings, and — for admins only — System Integrity.
- Teacher navigation remains role-appropriate rather than exposing inaccessible admin modules.
- Active destinations have an explicit background/color and `aria-current="page"`.
- The bar is fixed, thumb reachable, safe-area aware, and paired with matching main-content bottom padding.
- The existing desktop sidebar remains unchanged and available on large screens.

## 8. Dashboard changes

The mobile Dashboard now presents, in order:

1. Current date and number of today’s classes.
2. Two compact today metrics: classes and revenue.
3. Instant search for students, classes, and branches.
4. Attention items using existing unpaid tuition, substitution, and payroll status data.
5. Today’s class list with time, branch, and student count.
6. A small operational summary.

The prior Dashboard — including analysis, financial summaries, branch statistics, recent transactions, and quick actions — remains the desktop layout at `lg` and above. No query, financial formula, attendance rule, or payroll rule was changed.

## 9. Responsive behavior

- Below `lg`, the purpose-built mobile Dashboard and bottom navigation are displayed.
- At `lg` and above, the existing Dashboard and sidebar continue to render.
- Bottom sheets are mobile-only.
- Navigation and sticky action foundations account for `env(safe-area-inset-bottom)`.
- Form controls use at least 16px text on small screens to prevent unwanted mobile browser zoom.

## 10. Desktop compatibility

The desktop sidebar, header, Dashboard content, tables, links, and routes were not removed or rewritten. Desktop receives no fixed bottom navigation. Its main spacing returns to the existing `lg` padding rules, and the original Dashboard is displayed unchanged.

## 11. Accessibility improvements

- Semantic links and buttons are retained throughout.
- Primary navigation is labelled and active links use `aria-current`.
- The bottom sheet uses dialog semantics, a labelled heading, modal state, an explicit 44px close button, backdrop dismissal, and Escape dismissal.
- Search has a programmatic label and a clearly labelled clear action.
- Shared focus-visible styles improve keyboard visibility.
- Touch targets are generally at least 44px.
- Reduced-motion preferences collapse animations and transitions.
- Success and error primitives use appropriate status/alert roles.

## 12. Performance considerations

- No UI or animation dependency was added.
- Mobile and desktop Dashboard views share the same already-loaded state and calculations, avoiding duplicate data requests.
- The mobile layout uses CSS breakpoints rather than viewport measurement listeners.
- The sheet locks document scrolling only while open and cleans up keyboard/scroll state on close.
- Existing Dashboard queries were not broadened.
- Role-aware navigation makes one small profile lookup, matching the existing authorization presentation approach. Consolidating repeated role lookups across header/sidebar/navigation would require a wider session-context refactor and was intentionally deferred.

## 13. Validation results

- `git diff --check`: passed.
- `npx tsc --noEmit`: passed.
- `npm test`: 54 tests passed; one pre-existing System Integrity copy assertion still fails (`Xem dữ liệu kỹ thuật`). No System Integrity implementation was changed.
- `npm run build`: compilation, linting, and type validation passed; prerendering stopped at `/students` because the required Supabase URL/key are not present. No fake secrets were added.
- `npm run lint`: passed.
- `npm test`: 54 passed, 1 pre-existing failure in `tests/system-integrity-checker.test.ts`; see below.
- `npm run build`: compilation, linting, and type validation passed; prerendering then stopped at `/students/new` because Supabase URL/key environment variables are not available in this workspace.
- `npm run dev`: development server started successfully and reported ready.

## 14. Pre-existing errors discovered

- `tests/system-integrity-checker.test.ts` expects the literal UI text `Xem dữ liệu kỹ thuật`, which is absent from the existing `app/system-integrity/page.tsx`. None of the files involved in that assertion were changed in this task.
- Node reports `MODULE_TYPELESS_PACKAGE_JSON` warnings for TypeScript test files because `package.json` does not declare a module type. This task did not change package module behavior.
- A production build cannot complete static generation without the Supabase URL and API key. Secrets and `.env` files were intentionally not modified.

## 15. Changes reverted because they were unsafe

- No business-facing change required a code revert.
- System Integrity was excluded from the manager More sheet after authorization parity review because the existing application presents that destination only to admins.

## 16. UX ideas intentionally not implemented because they were too risky

- Attendance-completed/remaining status per class was not invented because the current Dashboard does not fetch a canonical attendance-completion source.
- Trial-students-today was not added because the Dashboard does not currently load a safe canonical metric for it.
- No financial shortcut, payment flow, destructive gesture, or swipe-to-delete interaction was added.
- No universal “+” workflow was wired to business actions.
- No custom navigation stack or global state architecture was introduced.
- Existing modals were not mass-converted to sheets.
- Repeated role/profile requests were not replaced with a new global auth architecture.

## 17. Screens intentionally not redesigned in this task

- Students list/detail/new
- Attendance and attendance history
- Tuition and receipt detail
- Teachers and teacher workflows
- Payroll and salary workflows
- Expenses and other revenue
- Reports
- Trial student workflows
- System Integrity
- Settings, branches/classes, and activity log

These screens continue to use their current business behavior and presentation. The new primitives prepare a later, incremental migration.

## 18. Mobile UX polish pass (September 2026)

### Mobile header cleanup

- The legacy hamburger, “Quản lý CLB” label, and large logout action are now hidden below the desktop breakpoint. The complete desktop header and sidebar behavior remain unchanged.
- Account identity and logout remain available from the mobile **Thêm** sheet, so no functionality was removed.

### Dashboard refinement

- The mobile-only Dashboard is now a daily operational briefing: a Vietnam-time greeting, compact class/student/attendance/revenue facts, then a prominent **Việc cần làm** list.
- Today’s revenue continues to use the existing tuition plus other-revenue calculation. Tuition, payroll, class schedule, membership, and attendance data continue to come from their existing tables and rules.
- A class is shown as attended only when an existing attendance row for that class and Vietnam date is available. No completion status is fabricated when that signal is absent.
- Desktop Dashboard markup remains in its existing `lg`-only view.

### Teacher “Lớp của tôi hôm nay”

- The primary teacher class view now resolves the logged-in active teacher, uses existing `class_teachers` assignments, filters active classes by today’s Vietnam schedule day, and sorts them by start time.
- Cards show start/end time, current active-student count, and a conservative state derived from time plus existing attendance records: **Sắp bắt đầu**, **Chưa điểm danh**, or **Đã điểm danh**.
- The empty state reads “Hôm nay bạn không có lớp.” Full assigned-class access remains available through **Thêm → Tất cả lớp**.

### Teacher navigation and safe areas

- Role-aware teacher destinations and active-route treatment are preserved. **Thêm** now includes Tất cả lớp, dạy thay, salary, account identity, and logout.
- Mobile page-end reservation was increased and explicitly reset at the desktop breakpoint. The fixed navigation and sticky actions continue to include `env(safe-area-inset-bottom)` for Android and iPhone-style devices.

### Validation and viewport review

- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm test`: 54 tests passed; one pre-existing System Integrity copy assertion still fails (`Xem dữ liệu kỹ thuật`). No System Integrity implementation was changed.
- `npm run build`: compilation, linting, and type validation passed; prerendering stopped at `/students` because the required Supabase URL/key are not present. No fake secrets were added.
- Mobile layout was reviewed against the 390×844 breakpoint rules; desktop separation was reviewed against the `lg` breakpoint used at 1440×900.
- Automated authenticated screenshots could not be produced in this environment because no browser automation tool or authenticated test session is configured.

### Deferred risky ideas

- A formal per-session attendance-completion record was not introduced. The UI uses the existing presence of class attendance rows and does not change attendance business logic.
- Trial-student counts were not added to the briefing because no already-loaded, canonical “trial today” metric was available.
- Substitution assignment logic, payroll calculations, authentication, database schema, functions, triggers, and RLS were intentionally left unchanged.

## 19. Recommended next migration order

Dashboard → Students → Attendance → Tuition → Teachers → Payroll → Reports → System Integrity

## 20. Recommended next task: Students mobile UX

Migrate only the Students list and detail navigation using the new foundation:

1. Audit the current query, filters, pagination, and student status rules; preserve them exactly.
2. Replace the small-screen table with compact `MobileListRow` cards while retaining the desktop table.
3. Make search instant, preserve query/filter/scroll state through detail navigation, and avoid new backend infrastructure.
4. Add a push-style mobile detail header with predictable browser Back behavior.
5. Surface identity, active status, current class, existing tuition status, and recent attendance using only current sources.
6. Keep add/edit/delete flows unchanged until each validation and confirmation path is separately audited.
7. Validate keyboard behavior, 44px targets, screen reader labels, mobile/desktop screenshots, lint, types, tests, and build.

## 21. Screenshots and visual verification notes

No browser automation/screenshot facility is available in this environment, and authenticated Dashboard data cannot be safely bypassed or mocked for a screenshot. The development server was started successfully. Responsive visibility, safe-area padding, active navigation state, dialog semantics, touch sizing, and desktop/mobile separation were verified through source inspection, TypeScript, ESLint, and production compilation. A final authenticated visual pass at approximately 390×844 and 1440×900 is recommended during review.

## 22. Final targeted Foundation pass (September 2026)

### Teacher long-name overflow: root cause and fix

- The today-class card was a flex row whose title used `truncate`, a single-line no-wrap treatment. Although the information child had `min-width: 0`, the card and its surrounding grid were not explicitly width-bounded, and the three-column sizing contract was implicit. A long class name could therefore participate in intrinsic sizing and widen the mobile document.
- The row is now an explicit three-column grid: `auto minmax(0, 1fr) auto`. The time column remains a stable, non-shrinking 56px column; the information column has `width: 100%`, `max-width: 100%`, and `min-width: 0`; and the chevron is non-shrinking.
- The card, list grid, and heading container are explicitly bounded to `width: 100%` and `max-width: 100%`, with `min-width: 0` where intrinsic sizing must be allowed to contract.
- The title no longer uses `truncate`/no-wrap. It wraps for at most two lines and combines word breaking with `overflow-wrap: anywhere`, so both normal Vietnamese labels and unexpectedly long tokens stay inside the available column.
- The short fixture `cs1 T7-CN Cô Thuỷ` and long fixture `cs2 T7-CN (CƠ BẢN) 10-11h30 Cô Nhung` were checked against the card sizing contract for 360px, 390px, 412px, and 430px. A regression test locks the zero-minimum middle column, bounded containers, two-line wrapping, and removal of title truncation. An authenticated browser session was not available for a live `scrollWidth === clientWidth` measurement or screenshot, so that final device check remains a review-environment step rather than being falsely reported as automated here.

### Teacher navigation simplification

- The default **Lớp** screen is exclusively the Vietnam-local today view: its date, assigned classes scheduled today, active-student counts, existing attendance-derived status, and calm no-class state. The header toggle/action was removed.
- **Thêm → Lịch của tôi** was replaced with **Thêm → Tất cả lớp**. Its `view=all` presentation reuses the exact same active `class_teachers` assignment query and displays the complete assigned-class list; no assignment or database behavior changed.
- The all-classes heading is now **Tất cả lớp**, avoiding the previous loop-like “Lịch của tôi” wording. The teacher bottom navigation remains Lớp, Điểm danh, Học thử, Chấm công, and Thêm.

### Desktop navigation breakpoint

- Root cause: `.abk-bottom-nav` declared `display: grid` in the custom global foundation CSS. That author rule could win over the generated `lg:hidden` utility, allowing the fixed mobile navigation to remain visible on desktop.
- A direct `min-width: 1024px` rule now sets `.abk-bottom-nav` to `display: none`. Existing `lg:pb-7` main padding already removes the mobile safe-area/content reservation at the same breakpoint; no compensating desktop bottom padding was added.
- The resulting contract is mobile navigation plus safe-area reservation below `lg`, and desktop sidebar with no bottom navigation or mobile reservation at and above `lg` (including 1440×900 and 1920×1080).

### Manager trial-registration navigation cleanup

- **Đăng ký học thử** was removed from both Manager navigation surfaces: the mobile More data and desktop sidebar data.
- The sidebar's new-lead count query, state, and badge were removed because they existed only for that deleted link.
- **Học thử** / **Quản lý học thử** remains. The `/dashboard/trial-leads` page, trial-lead data, activity-log label, public metadata, public registration site, and public registration controls remain unchanged.

### Preserved scope and validation

- Admin Dashboard ordering, alerts, activity summary, and all financial calculations were left unchanged.
- Admin More retains its existing management, finance, and system destinations, including **Học thử**, and does not reintroduce **Đăng ký học thử**.
- No database, migration, Supabase, RLS, authentication, environment, attendance, tuition, payroll, payment, Android, Gradle, or Capacitor file was modified.
- `git diff --check`: passed.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm test`: 58 tests passed and one pre-existing System Integrity copy assertion failed because `Xem dữ liệu kỹ thuật` is absent. No System Integrity file was changed.
- `npm run build`: compilation, linting, and type validation passed; static generation then stopped at `/settings` because the required Supabase URL/key are unavailable. No fake secrets or environment files were added.
- The final navigation search found no **Đăng ký học thử** in either Manager navigation component; expected public-site, activity-log, route, metadata, and report references remain.
- Browser automation installation was blocked by an npm registry `403`, and there is no installed browser or authenticated test session. Consequently, no screenshot was fabricated; the 360/390/412/430 mobile and 1440/1920 desktop contracts were validated by the focused regression test and responsive source rules.
