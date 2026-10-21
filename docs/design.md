# Design reference lock

## Language, answer feedback and multiplayer extension

Direct build uses this existing Ascend design as the primary reference: violet actions, dark panels, thin borders, the current type scale and sidebar. Live Refero style research was attempted for the extension but returned `NO_SUBSCRIPTION`; the bundled `craft-details.md` was reviewed for form errors, focus, input labels and touch targets.

| Decision | Source | Role | Reason |
|---|---|---|---|
| Compact language select on auth and in the top bar | User's three-language requirement + existing settings controls | Persistent preference | Accessible from every screen |
| Independent eye buttons and errors beside fields | User request + Refero form craft guide | Input visibility and recovery | Support keyboard use and identify the invalid field |
| Green/red only on the submitted choice | User request + existing mint success token | Answer feedback | Keep the correct choice private after a mistake |
| Create/join → lobby → timed question → results | [Brain Show official product page](https://store.steampowered.com/app/2235150/) + user request | Multiplayer journey | Shared quiz competition using the existing question bank |
| Room code above the question, adjacent score list | Existing course-detail layout | Session identity and standings | Keep the current question dominant |
| Server deadlines, private snapshots and reconnection | [Microsoft SignalR documentation](https://learn.microsoft.com/en-us/aspnet/core/signalr/javascript-client?view=aspnetcore-9.0) | Real-time behavior | All players share authoritative rounds and scores |

Preserve the original tokens and responsive panels. The room code is the main lobby detail; no new illustrations or independent visual theme are introduced. Check auth and answer feedback on 390px and multiplayer on desktop and 390px after implementation.

Audience: university students learning programming. Goal: choose the next useful challenge and see real progress. Direct implementation follows the explicit dark purple brief.

Live Refero research was attempted but returned NO_SUBSCRIPTION. Bundled craft-details and motion guides were read. External primary references:
- https://linear.app/now/how-we-redesigned-the-linear-ui — hierarchy, density and distinct navigation/work surfaces.
- https://duolingo-data.s3.amazonaws.com/s3/press-assets/Duolingo_for_Schools_Guide.pdf — learning path with adjacent daily goal and leaderboard.

| Decision | Source | Role | Reason |
|---|---|---|---|
| Dark violet canvas, violet primary action | User sections 32–34 | Identity and action | Explicit palette |
| Quiet sidebar, bordered work panels | Linear UI research | Navigation hierarchy | Keep challenge content dominant |
| Level path, completion nodes | Duolingo guide + user section 28 | Learning progression | Explain locked and available tasks |
| Side rail for goal and league | Duolingo guide | Motivation | Keep progress near primary action |
| Short feedback and reduced motion | Refero motion guide | Feedback | Accessible, responsive interactions |
| Geometric CSS crystal | User section 34 | Decorative hero only | Lightweight code-native graphic |

Preserve: #0F0B1F canvas, #151126 panels, white text, violet actions, mint success, amber streak; 240px sidebar; 12–20px radius; thin borders. Crystal only decorates the next-challenge feature. Never use gradients behind dense tables. Auth → dashboard → course path → task → server feedback → updated progress. No progress is fabricated in the browser.
