---
name: panel-expand-transition
description: "Add a project-detail panel expand transition to this static homepage. Card morphs into a centered modal; detail page loads in an iframe; back button closes the panel."
---

# Panel Expand Transition

Add a FLIP-style panel expand transition so clicking a project card opens its detail page in a centered modal panel, while the original card morphs into the panel.

## Files

- `templates/home-panel.html` — snippet to paste into `index.html`
- `templates/project-page.html` — starter detail page

## How to add a new project panel

1. Create `PROJECT.html` from `templates/project-page.html` (replace `PROJECT` with the slug).
2. In `index.html`, mark the card with `data-project="PROJECT"`.
3. If the panel shell is not yet in `index.html`, paste `templates/home-panel.html` before `</body>`.
4. Test: click the card → panel expands → click **Back to projects** → panel closes.

## Notes

- Detail pages are loaded with `?embed=1`. Use that query param in CSS/JS to hide standalone-only elements.
- Keep detail pages lightweight; heavy assets may delay the content fade-in.
- The back button uses `postMessage('close-project-panel')` to talk to the parent page.
