---
name: snapfix-ui
description: Provides SnapFix-specific UI/UX design and implementation guidance for the civic-tech complaint management platform. Use when designing, reviewing, or modifying SnapFix frontend interfaces.
---

# SnapFix UI/UX Design Skill

## 1. Product Identity

SnapFix is a civic-tech complaint reporting, tracking, verification, assignment, resolution, and accountability platform.

The product connects citizens with the appropriate civic department and makes the complete complaint lifecycle visible and traceable.

Core lifecycle:

REPORT → VERIFY → ASSIGN → SOLVE → PROVE → CONFIRM → CLOSE

SnapFix should feel like a real civic technology product, not a generic SaaS dashboard, AI-generated template, or simple complaint form.

The interface must communicate:

- trust
- accountability
- transparency
- progress
- civic responsibility
- community participation
- traceability
- clear ownership

The visual language should be distinctive to SnapFix and consistent across the entire application.

---

# 2. Technology Constraints

The existing SnapFix architecture is LOCKED.

Use only:

- Flask
- Jinja/Jinja2
- HTML
- CSS
- Vanilla JavaScript
- REST/API
- Firebase Authentication
- Cloud Firestore
- Cloudinary

DO NOT introduce:

- React
- Vite
- Node.js
- npm
- Tailwind CSS
- Bootstrap
- Material UI
- Vue
- Angular
- Next.js
- SQLAlchemy
- PostgreSQL
- Firebase Storage

Do not migrate or rewrite the application architecture for UI purposes.

Do not introduce a frontend framework simply because it would make UI implementation easier.

Prefer improving the existing templates, CSS, and JavaScript structure.

---

# 3. Protect Existing Functionality

UI redesign must NOT change existing application behavior unless a genuine frontend bug requires it.

Preserve:

- Firebase Authentication
- email verification
- role-based access
- Firestore data structure
- Cloudinary image handling
- complaint APIs
- complaint lifecycle
- report IDs
- support system
- duplicate complaint behavior
- assignment validation
- worker availability
- transfer workflow
- escalation workflow
- deadlines
- extension requests
- proof submission
- citizen confirmation
- rejection/reopening
- false-report handling
- audit history
- performance metrics
- ban/unban behavior

Do not remove functionality just because the current UI is being redesigned.

Do not create fake/mock data to make screens look populated.

Do not modify Firestore schema merely to achieve a visual effect.

Do not change backend permissions or authorization rules as part of a visual redesign.

---

# 4. Roles

SnapFix uses these canonical roles:

- main_authority
- city_admin
- department_head
- service_worker
- citizen

Administrative hierarchy:

MAIN AUTHORITY
↓
CITY ADMIN
↓
DEPARTMENT HEAD
↓
SERVICE WORKER

Citizen is public-facing and outside the administrative hierarchy.

Do not introduce a "City Head" role.

Do not rename `service_worker` to `worker`.

UI must clearly communicate the user's current role without making the interface feel unnecessarily complicated.

---

# 5. Core Design Direction

SnapFix must NOT look like a generic AI-generated SaaS product.

Avoid:

- giant white cards
- card grids everywhere
- identical rounded cards for every piece of information
- excessive border-radius
- excessive soft shadows
- purple/pink AI gradients
- random decorative gradients
- glassmorphism
- floating blobs without meaning
- excessive animations
- excessive icons
- emoji-heavy interfaces
- generic dashboard templates
- unnecessary all-caps labels
- decorative labels that communicate nothing
- excessive pills/badges
- arbitrary numbered sections
- repetitive "A · B · C" metadata strings
- generic "AI dashboard" visual language

Do not make every element look like a card.

Visual hierarchy should come from:

- spacing
- typography
- grouping
- borders
- alignment
- contrast
- meaningful status treatment
- layout
- selective containers

Use decoration only when it supports the product's civic context.

---

# 6. Civic-Tech Visual Identity

The design should feel connected to:

- cities
- public infrastructure
- neighborhoods
- maps
- civic services
- reporting
- accountability
- progress
- real-world issues

Possible visual motifs include:

- subtle map/grid structures
- route lines
- location references
- civic infrastructure imagery
- structured timelines
- progress indicators
- geographic/contextual visual cues

These should remain subtle and purposeful.

Do not turn the interface into a literal map-themed illustration everywhere.

SnapFix should feel modern and technology-driven while remaining trustworthy and civic.

---

# 7. Typography

Typography must be intentional.

Do not automatically use the default browser/system typography everywhere without considering hierarchy.

Use a clear typographic system:

- strong page titles
- readable body text
- clear section headings
- distinct supporting text
- clear metadata hierarchy

Do not use different fonts merely for decoration.

Do not use:

- excessive font weights
- excessive italics
- decorative typography that harms readability
- all-caps headings everywhere

Prefer sentence case.

Keep text concise.

Interface copy should help users understand what to do.

---

# 8. Color System

Create a deliberate SnapFix color system.

The primary brand direction should communicate:

- civic trust
- technology
- clarity
- reliability

Use a restrained primary civic color with carefully chosen supporting neutrals and status colors.

Status colors must have semantic meaning.

For example:

- pending / awaiting action
- verified
- assigned
- in progress
- proof submitted
- completed
- rejected
- reopened
- overdue
- escalated

Do not use color only for decoration.

Never rely on color alone to communicate an important status.

Combine status color with:

- text
- iconography
- structure
- labels

Maintain sufficient contrast.

---

# 9. Layout Philosophy

SnapFix pages should have clear composition.

Avoid:

"navbar + giant white card + empty space"

Instead, create intentional page structures.

A page should generally have:

1. clear page identity
2. useful context
3. primary action or information
4. supporting information
5. appropriate secondary actions

Use whitespace deliberately.

Whitespace should create hierarchy rather than make the page feel unfinished.

Do not fill empty areas with meaningless cards or decoration.

---

# 10. Navigation

Navigation should remain simple and predictable.

The navigation should communicate:

- SnapFix identity
- current section
- available role-specific actions
- profile/account access

Avoid overcrowding the navbar.

Do not expose administrative actions to unauthorized roles.

Use consistent active-state treatment.

Navigation should remain usable on smaller screens.

---

# 11. Login and Authentication UI

The login page should feel like entering the SnapFix product, not opening a generic authentication template.

Avoid:

- huge centered white rectangle
- plain form floating in empty space
- excessive decorative gradients
- generic SaaS login imagery

Use a composed layout with:

- SnapFix identity
- concise civic-focused message
- clear login form
- strong visual hierarchy
- appropriate supporting information

The existing product concept may be used where appropriate:

"Because reporting a pothole shouldn't feel like shouting into the void."

Supporting concept:

"SnapFix connects citizens with the right department, tracks every step, and puts accountability where it belongs."

Do not repeat marketing copy unnecessarily.

Authentication screens must clearly support:

- login
- registration
- email verification
- forgot password
- authentication errors

Errors should be human-readable.

Do not expose raw Firebase errors directly to users when they can be translated into useful interface messages.

---

# 12. Registration UI

Registration should feel like part of the same product system as login.

Maintain:

- clear field labels
- clear validation
- useful error messages
- appropriate password guidance
- accessible focus states
- clear transition back to login

Do not create a completely different visual language.

---

# 13. Citizen Experience

Citizen-facing screens should prioritize:

- reporting an issue
- tracking a complaint
- understanding status
- supporting existing complaints
- viewing proof
- confirming or rejecting resolution

Citizens should not need to understand internal administrative terminology to use SnapFix.

Use plain language.

Example:

Prefer:

"Who is handling this?"

over:

"Current assignment entity"

Prefer:

"Waiting for department verification"

over:

"Pending verification state"

---

# 14. Complaint Reporting

The complaint form should feel guided rather than like a database entry form.

Group related information logically:

- issue details
- category
- location
- supporting images
- additional information

Do not make the form unnecessarily long.

Use meaningful labels.

Do not hide important requirements.

Location should remain consistent with the existing implementation.

Do not invent locations or fake geolocation data.

---

# 15. Complaint Lists

Complaint lists should prioritize scanning.

Important information should be visually identifiable:

- Report ID
- title
- category
- location
- status
- priority
- department
- deadline where relevant
- relevant action

Do not display every possible database field in the list.

Use progressive disclosure for secondary information.

Search and filtering should feel integrated into the page rather than like random controls placed above a table.

---

# 16. Complaint Detail

Complaint detail is one of the most important screens in SnapFix.

The layout should make the following immediately understandable:

- Report ID
- complaint title
- current status
- priority
- location
- department
- assigned worker
- deadline
- proof
- citizen confirmation
- available next action

The complaint lifecycle should be visually understandable.

The audit timeline/history is a major SnapFix differentiator.

Do not reduce it to a generic unordered list.

Timeline entries should communicate:

- event
- actor
- actor role
- timestamp
- reason when relevant
- previous/current state when relevant

The user should be able to understand what happened without reading raw database data.

---

# 17. Complaint Lifecycle Visualization

Use the lifecycle:

REPORT
→ VERIFY
→ ASSIGN
→ SOLVE
→ PROVE
→ CONFIRM
→ CLOSE

The current stage should be obvious.

Completed stages should visually differ from:

- current stage
- upcoming stage
- blocked/rejected stage

When a complaint is reopened, the interface must communicate that the previous resolution attempt remains part of the history.

Do not erase previous proof or history visually.

---

# 18. Public Wall

The Public Wall is a major citizen-facing feature.

It should feel like a civic issue feed, NOT a social media clone.

Users should be able to understand:

- what issue exists
- where it exists
- current status
- report ID
- community support
- resolution/proof status where applicable

Keep citizen privacy protected.

Do not expose private citizen information.

The existing Public Wall tabs should remain meaningful:

- COMPLAINTS
- IN PROGRESS
- COMPLETED

Search and filtering should feel purposeful.

---

# 19. Support System

Supporting a complaint should be visually clear.

The interface should communicate:

- whether the current citizen already supports it
- support count
- what the action will do

Avoid gamifying civic support unnecessarily.

Do not make support look like social-media likes.

---

# 20. Administrative Dashboards

Administrative interfaces should be operational.

Do not redesign them as marketing pages.

Dashboards should prioritize:

- actionable complaints
- pending verification
- assignment work
- deadlines
- escalations
- transfers
- workload
- performance information

Statistics should be visually useful rather than decorative.

Avoid creating ten different statistic cards merely because the data exists.

Prioritize the metrics that help the role make decisions.

---

# 21. Department Head Interface

Department Heads operate within their own department.

The UI should make department scope clear.

Department Heads should be able to understand:

- complaints in their department
- verification work
- worker assignments
- transfer requests
- deadlines
- escalations
- performance

Do not visually imply that a Department Head controls other departments.

---

# 22. Service Worker Interface

Service Worker UI should prioritize field execution.

Important information:

- assigned complaints
- assignment state
- location
- deadline
- priority
- work status
- proof submission
- extension request
- rejection where allowed

The interface should minimize unnecessary administrative complexity.

Workers should quickly understand:

"What do I need to do next?"

Assignment states include:

- PENDING ACCEPTANCE
- ACCEPTED / ASSIGNED
- IN PROGRESS
- PROOF SUBMITTED
- COMPLETED / CLOSED

Do not confuse assignment state with complaint status.

---

# 23. Department Transfer UI

Transfer is an important workflow.

The interface should clearly communicate:

- current department
- requested target department
- reason
- requester
- request status
- target department response
- timestamps
- resulting department change

Transfer history must remain visible.

Do not hide department changes.

Wrong-department handling should be understandable without exposing unnecessary technical details.

City Admin intervention should be visually distinct from routine Department Head transfer actions.

---

# 24. Escalation UI

Escalations should clearly show:

- current authority
- target authority
- reason
- requester
- status
- response
- timestamp

Do not make escalation visually identical to ordinary complaint comments.

Escalation is an accountability event and should have stronger hierarchy.

---

# 25. Deadlines and Extensions

Deadlines should be easy to identify.

Use clear visual treatment for:

- active deadline
- approaching deadline
- overdue deadline
- extended deadline

Extension history should remain available.

Do not hide the original deadline after an extension.

The interface should communicate that an extension happened rather than silently replacing the original value.

---

# 26. Proof and Citizen Confirmation

Proof submission is a major lifecycle step.

Proof UI should clearly communicate:

- submitted proof
- submission timestamp
- worker
- current verification state
- citizen action

Citizen confirmation should clearly provide:

- confirm resolution
- reject resolution

If proof is rejected:

- previous proof remains in history
- complaint becomes reopened
- the same rejected worker cannot continue that reopened complaint
- reassignment is required

The UI must communicate this state change clearly.

---

# 27. False Reports

False-report handling should be serious but not visually aggressive.

When a Service Worker marks a report false:

- reason is required
- history is preserved
- citizen false-report count is updated

Do not expose internal moderation terminology unnecessarily to ordinary citizens.

---

# 28. User Management

Administrative user management should prioritize:

- identity
- role
- department
- status
- actions

Use clear distinction between:

- active
- banned

Banned-user behavior should be communicated clearly.

Do not expose unnecessary internal identifiers.

---

# 29. Empty States

Empty states are part of the product design.

Do not show huge blank spaces with only:

"No data found."

Instead:

- explain what is empty
- explain why when useful
- provide the appropriate next action

Examples:

"No complaints yet."

"Once you report an issue, it will appear here."

"Create your first report"

Empty states must remain concise.

---

# 30. Loading States

Loading should communicate that the system is working.

Avoid excessive skeleton animations.

Do not use indefinite spinners without context when a better loading treatment is possible.

Loading must not create layout jumps where avoidable.

---

# 31. Error States

Errors should be actionable.

Avoid vague messages such as:

"Something went wrong."

when the actual cause is known.

Prefer:

"Your complaints could not be loaded. Check your connection and try again."

or another accurate message based on the actual error.

Never expose raw stack traces or internal exception messages to normal users.

Do not hide backend failures by silently retrying forever.

---

# 32. Motion

Use motion sparingly.

Motion should communicate:

- state change
- confirmation
- expansion
- navigation
- important interaction feedback

Avoid:

- continuous pulsing
- unnecessary floating animations
- excessive card hover animations
- animation on every section
- decorative movement with no purpose

Respect reduced-motion preferences.

---

# 33. Responsive Design

SnapFix must work across:

- desktop
- laptop
- tablet
- mobile

Do not simply shrink the desktop layout.

On mobile:

- navigation should remain usable
- actions should remain accessible
- cards should not overflow
- tables should have an intentional mobile strategy
- complaint details should remain readable
- forms should be easy to complete
- important actions should remain reachable

Avoid horizontal overflow.

---

# 34. Accessibility

Maintain:

- visible keyboard focus
- sufficient color contrast
- semantic HTML where practical
- meaningful labels
- accessible form controls
- understandable error messages
- non-color status communication
- reasonable touch target sizes
- reduced-motion support

Do not sacrifice accessibility for visual effects.

---

# 35. Icons

Use one consistent icon language.

Do not mix random icon styles.

Icons should communicate meaning.

Do not use icons simply to fill empty space.

Do not replace clear text with an icon when the meaning could become ambiguous.

---

# 36. Buttons

Buttons should describe the action they perform.

Prefer:

- Save changes
- Assign worker
- Verify complaint
- Request transfer
- Accept transfer
- Reject transfer
- Submit proof
- Confirm resolution
- Reject proof

Avoid vague labels such as:

- Submit
- Proceed
- Continue

when a more precise action name is possible.

Primary, secondary, destructive, and quiet actions should have a consistent hierarchy.

---

# 37. Forms and Modals

Forms should use clear grouping and hierarchy.

Modals should be used only when they improve the workflow.

Do not create giant modal windows that behave like full pages.

Destructive actions should require appropriate confirmation.

Confirmation should explain what will happen.

For actions requiring a reason, make the reason field clearly mandatory.

---

# 38. CSS Architecture

Keep CSS maintainable.

Prefer:

- shared variables
- reusable utility patterns where appropriate
- component-level classes
- predictable naming
- low specificity
- minimal duplication

Avoid:

- deeply nested selectors
- `!important` as a default solution
- duplicate declarations
- conflicting selectors
- page-specific overrides that accidentally break shared components

Before adding a new style, check whether an existing shared component can be improved instead.

---

# 39. JavaScript Safety

Do not break existing JavaScript behavior while redesigning markup.

Before changing:

- IDs
- classes
- data attributes
- form names
- selectors
- event targets

search the project for their usage.

If markup must change, update all dependent JavaScript safely.

Do not add blind retries or arbitrary `setTimeout()` calls to hide frontend bugs.

Trace the actual cause.

---

# 40. Authentication Race Conditions

Authentication-dependent pages must handle Firebase auth initialization correctly.

Do not assume the user object is immediately available during initial page load.

When a page depends on authenticated user state:

- wait for the appropriate auth initialization
- then make authenticated API requests
- correctly distinguish loading, empty, and error states

Do not solve auth races with arbitrary delays.

A retry button should not be required for normal first-load functionality.

---

# 41. Design Before Implementation

For significant UI redesigns, work in this order:

1. Inspect the existing implementation.
2. Understand the page's purpose.
3. Identify the actual users and actions.
4. Establish the visual system.
5. Create a concise design plan.
6. Review the plan for generic/template-like decisions.
7. Revise weak decisions.
8. Implement shared foundations.
9. Implement pages systematically.
10. Run tests.
11. Review for regressions.

Do not immediately rewrite the page after receiving a vague request such as "make it prettier."

Make deliberate design decisions first.

---

# 42. Preserve Strong Existing Design Decisions

If an existing SnapFix element already has a strong and intentional design direction, preserve it unless the redesign has a clear reason to improve it.

Do not redesign everything merely for the sake of changing it.

The goal is a coherent product, not maximum visual novelty.

---

# 43. Browser Automation Restriction

DO NOT use Chrome.

DO NOT launch browser automation.

DO NOT use the browser agent.

DO NOT consume browser-agent credits.

For normal UI implementation and code review, work from:

- source code
- templates
- CSS
- JavaScript
- existing screenshots
- static analysis
- automated tests

Only use browser automation if the user explicitly requests it.

---

# 44. Testing

After UI implementation:

Run the existing test suite.

Do not delete tests.

Do not weaken tests to make them pass.

Do not modify tests merely to accommodate broken UI behavior.

Check:

- Python syntax
- template syntax
- JavaScript syntax where possible
- CSS references
- static asset paths
- API request compatibility
- authentication-dependent flows
- existing role behavior

The current testing directory is intentionally separated from production code.

Do not move test files into production directories.

---

# 45. Git Safety

Do not automatically commit UI changes.

The user controls commits.

Before finishing, report:

- files changed
- major UI changes
- tests executed
- test results
- known issues
- anything that still needs manual visual review

Never silently overwrite unrelated user work.

---

# 46. Final Quality Standard

Before considering a SnapFix UI change complete, ask:

1. Does this look specifically designed for SnapFix?
2. Could this same design have been generated for a random SaaS dashboard?
3. Is every major visual element serving a purpose?
4. Is the hierarchy immediately understandable?
5. Can a citizen understand what to do?
6. Can an authority understand what needs attention?
7. Can a worker understand the next action?
8. Are status and ownership clear?
9. Are errors and empty states useful?
10. Does the interface remain coherent across pages?
11. Does it work without changing the existing architecture?
12. Did the redesign preserve existing functionality?
13. Is the interface accessible?
14. Is the responsive behavior intentional?
15. Has unnecessary decoration been removed?

If the result still looks like a generic template, revise the design before considering the work complete.