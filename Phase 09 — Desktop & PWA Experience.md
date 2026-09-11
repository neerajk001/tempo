# Phase 09 — Desktop/PWA Experience

## Objective

Make the application comfortable to use as a desktop productivity tool.

---

# 1. PWA

Configure the application as a Progressive Web App.

Provide:

- manifest
- app icon
- standalone display
- appropriate metadata

---

# 2. Installable Experience

The user should be able to install the application from the browser.

The installed application should feel like:

```text
Desktop App
```

rather than a normal browser tab.

---

# 3. Focus Mode

Create a distraction-free focus mode.

When a Pomodoro starts:

```text
Task name

47:32

[ Pause ]
```

Reduce unnecessary UI.

---

# 4. Keyboard Shortcuts

Support useful shortcuts such as:

```text
Space
Start / Pause

R
Resume

Esc
Exit focus mode
```

Do not interfere with browser/system shortcuts.

---

# 5. Visibility Handling

Handle:

```text
tab hidden
tab visible
browser minimized
computer sleep
```

The timer must remain timestamp-based so elapsed time is not incorrectly dependent on JavaScript intervals.

---

# 6. Notifications

Use browser notifications where appropriate.

Examples:

```text
Pomodoro complete
Break complete
```

Notifications must be optional.

---

# Acceptance Criteria

- application can be installed
- standalone mode works
- focus mode works
- keyboard controls work
- timer remains accurate when tab is inactive
- optional notifications work