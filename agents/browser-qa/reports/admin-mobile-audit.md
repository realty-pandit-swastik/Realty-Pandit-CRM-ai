# Admin Panel Mobile UI/UX Audit Report

**Date**: 2026-03-12
**Viewport**: 375x812 (iPhone 13/14)
**Target**: https://admin.realtypandit.in
**Duration**: 4.2 minutes

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 20 |
| WARNING | 25 |
| INFO | 0 |
| **TOTAL** | **45** |

## Global Issues (appear on most/all tabs)

- **[WARNING] Fixed Elements**: Fixed elements use 107% of viewport — 2 elements: div(812px), div(56px) *(affects 8 tabs)*
- **[CRITICAL] Navigation**: Could not navigate: locator.click: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for locator('button:has-text("Menu")').last()[22m
[2m    - locator resolved to <button>…</button>[22m
[2m  - attempting click action[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <div>…</div> intercepts pointer events[22m
[2m    - retrying click action[22m
[2m    - waiting 20ms[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <div>…</div> intercepts pointer events[22m
[2m    - retrying click action[22m
[2m      - waiting 100ms[22m
[2m    28 × waiting for element to be visible, enabled and stable[22m
[2m       - element is visible, enabled and stable[22m
[2m       - scrolling into view if needed[22m
[2m       - done scrolling[22m
[2m       - <div>…</div> intercepts pointer events[22m
[2m     - retrying click action[22m
[2m       - waiting 500ms[22m
 —  *(affects 12 tabs)*
- **[CRITICAL] ConsoleError**: JS Console Error — Failed to load resource: the server responded with a status of 403 (Forbidden) *(affects 3 tabs)*

## Per-Tab Issues

### Home (0 critical, 3 other)

- **[WARNING] Cut Off**: Element extends past right edge: button("👥 User Performance") — Overflows by 30px
- **[WARNING] Cut Off**: Element extends past right edge: button("🎯 Lead Sources") — Overflows by 149px
- **[WARNING] Cut Off**: Element extends past right edge: button("🏠 Property Analytics") — Overflows by 291px

### Chats (0 critical, 1 other)

- **[WARNING] Cut Off**: Element extends past right edge: button("🔥 Hot") — Overflows by 5px

### Inventory (1 critical, 4 other)

- **[CRITICAL] Overlap**: button("+") overlaps button("🎤") (84%) — (303,675) vs (303,666)
- **[WARNING] Small Text**: "RENT" at 11px — Min recommended: 12px for mobile readability
- **[WARNING] Small Text**: "active" at 11px — Min recommended: 12px for mobile readability
- **[WARNING] Small Text**: "Deactivate" at 11px — Min recommended: 12px for mobile readability
- **[WARNING] Small Text**: "SELL" at 11px — Min recommended: 12px for mobile readability

### Team (0 critical, 1 other)

- **[WARNING] Small Text**: "TEAM MEMBERS (0)" at 11px — Min recommended: 12px for mobile readability

### Dashboard (0 critical, 3 other)

- **[WARNING] Cut Off**: Element extends past right edge: button("👥 User Performance") — Overflows by 30px
- **[WARNING] Cut Off**: Element extends past right edge: button("🎯 Lead Sources") — Overflows by 149px
- **[WARNING] Cut Off**: Element extends past right edge: button("🏠 Property Analytics") — Overflows by 291px

### Calendar — no unique issues

### Emails (0 critical, 3 other)

- **[WARNING] Cut Off**: Element extends past right edge: button("✉️ Compose Email") — Overflows by 91px
- **[WARNING] Cut Off**: Element extends past right edge: button("📨 Bulk Send") — Overflows by 175px
- **[WARNING] Cut Off**: Element extends past right edge: button("Clear") — Overflows by 46px

### Call Log (3 critical, 1 other)

- **[CRITICAL] Overlap**: input("") overlaps button("💬 Chats") (48%) — (74,767) vs (79,754)
- **[CRITICAL] Overlap**: input("") overlaps button("🏠 Inventory") (34%) — (74,767) vs (150,754)
- **[CRITICAL] Overlap**: input("") overlaps button("💬 Chats") (34%) — (54,791) vs (79,754)
- **[WARNING] Small Touch Target**: input("") is 116x21px — Min recommended: 44x44px

### Ext. Leads (0 critical, 1 other)

- **[WARNING] Navigation**: Tab not found in menu drawer (may require specific permissions) — 

### Partner Agents — no unique issues

### Reports — no unique issues

### AI Agents — no unique issues

### Agent Logs — no unique issues

### Override — no unique issues

### Workflows — no unique issues

### Marketing — no unique issues

### Tasks — no unique issues

### Analytics (1 critical, 0 other)

- **[CRITICAL] Navigation**: Could not navigate: locator.click: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for locator('button:has-text("Menu")').last()[22m
[2m    - locator resolved to <button>…</button>[22m
[2m  - attempting click action[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <div>…</div> intercepts pointer events[22m
[2m    - retrying click action[22m
[2m    - waiting 20ms[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <div>…</div> intercepts pointer events[22m
[2m    - retrying click action[22m
[2m      - waiting 100ms[22m
[2m    29 × waiting for element to be visible, enabled and stable[22m
[2m       - element is visible, enabled and stable[22m
[2m       - scrolling into view if needed[22m
[2m       - done scrolling[22m
[2m       - <div>…</div> intercepts pointer events[22m
[2m     - retrying click action[22m
[2m       - waiting 500ms[22m
 — 

### Deal Pipeline — no unique issues

### Buyer Lead — no unique issues

### Property Map — no unique issues

### Live Status — no unique issues

## Issues by Category

### Navigation: 14 issues (13 critical)
- [Ext. Leads] Tab not found in menu drawer (may require specific permissions) — 
- [Partner Agents] Could not navigate: locator.click: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for locator('button:has-text("Menu")').last()[22m
[2m    - locator resolved to <button>…</button>[22m
[2m  - attempting click action[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <div>…</div> intercepts pointer events[22m
[2m    - retrying click action[22m
[2m    - waiting 20ms[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <div>…</div> intercepts pointer events[22m
[2m    - retrying click action[22m
[2m      - waiting 100ms[22m
[2m    28 × waiting for element to be visible, enabled and stable[22m
[2m       - element is visible, enabled and stable[22m
[2m       - scrolling into view if needed[22m
[2m       - done scrolling[22m
[2m       - <div>…</div> intercepts pointer events[22m
[2m     - retrying click action[22m
[2m       - waiting 500ms[22m
 — 
- [Analytics] Could not navigate: locator.click: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for locator('button:has-text("Menu")').last()[22m
[2m    - locator resolved to <button>…</button>[22m
[2m  - attempting click action[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <div>…</div> intercepts pointer events[22m
[2m    - retrying click action[22m
[2m    - waiting 20ms[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <div>…</div> intercepts pointer events[22m
[2m    - retrying click action[22m
[2m      - waiting 100ms[22m
[2m    29 × waiting for element to be visible, enabled and stable[22m
[2m       - element is visible, enabled and stable[22m
[2m       - scrolling into view if needed[22m
[2m       - done scrolling[22m
[2m       - <div>…</div> intercepts pointer events[22m
[2m     - retrying click action[22m
[2m       - waiting 500ms[22m
 — 

### Cut Off: 10 issues (0 critical)
- [Home] Element extends past right edge: button("👥 User Performance") — Overflows by 30px
- [Home] Element extends past right edge: button("🎯 Lead Sources") — Overflows by 149px
- [Home] Element extends past right edge: button("🏠 Property Analytics") — Overflows by 291px
- [Chats] Element extends past right edge: button("🔥 Hot") — Overflows by 5px
- [Emails] Element extends past right edge: button("✉️ Compose Email") — Overflows by 91px
- [Emails] Element extends past right edge: button("📨 Bulk Send") — Overflows by 175px
- [Emails] Element extends past right edge: button("Clear") — Overflows by 46px

### Fixed Elements: 8 issues (0 critical)
- [Home] Fixed elements use 107% of viewport — 2 elements: div(812px), div(56px)

### Small Text: 5 issues (0 critical)
- [Inventory] "RENT" at 11px — Min recommended: 12px for mobile readability
- [Inventory] "active" at 11px — Min recommended: 12px for mobile readability
- [Inventory] "Deactivate" at 11px — Min recommended: 12px for mobile readability
- [Inventory] "SELL" at 11px — Min recommended: 12px for mobile readability
- [Team] "TEAM MEMBERS (0)" at 11px — Min recommended: 12px for mobile readability

### Overlap: 4 issues (4 critical)
- [Inventory] button("+") overlaps button("🎤") (84%) — (303,675) vs (303,666)
- [Call Log] input("") overlaps button("💬 Chats") (48%) — (74,767) vs (79,754)
- [Call Log] input("") overlaps button("🏠 Inventory") (34%) — (74,767) vs (150,754)
- [Call Log] input("") overlaps button("💬 Chats") (34%) — (54,791) vs (79,754)

### ConsoleError: 3 issues (3 critical)
- [Inventory] JS Console Error — Failed to load resource: the server responded with a status of 403 (Forbidden)

### Small Touch Target: 1 issues (0 critical)
- [Call Log] input("") is 116x21px — Min recommended: 44x44px

## Screenshots Taken: 17

- **Home**: `01-home.png`
- **Home (viewport)**: `01-home-viewport.png`
- **Chats**: `02-chats.png`
- **Chats (viewport)**: `02-chats-viewport.png`
- **Inventory**: `03-inventory.png`
- **Inventory (viewport)**: `03-inventory-viewport.png`
- **Team**: `04-team.png`
- **Team (viewport)**: `04-team-viewport.png`
- **Menu Drawer**: `05-menu-drawer.png`
- **Dashboard**: `05-dashboard.png`
- **Dashboard (viewport)**: `05-dashboard-viewport.png`
- **Calendar**: `06-calendar.png`
- **Calendar (viewport)**: `06-calendar-viewport.png`
- **Emails**: `07-emails.png`
- **Emails (viewport)**: `07-emails-viewport.png`
- **Call Log**: `08-call-log.png`
- **Call Log (viewport)**: `08-call-log-viewport.png`
