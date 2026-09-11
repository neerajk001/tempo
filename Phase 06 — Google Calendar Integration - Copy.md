# Phase 06 — Google Calendar Integration

## Objective

Integrate Google Calendar so the application can read the user's planned calendar events.

Do not overcomplicate this phase.

---

# 1. Google Cloud

Configure:

- Google Cloud project
- Google Calendar API
- OAuth credentials
- required environment variables

Never commit credentials.

---

# 2. OAuth

Implement Google authentication.

Request only the minimum Calendar permissions required.

Initially:

```text
calendar.readonly
```

is sufficient for reading calendar events.

---

# 3. Calendar Service

Create a dedicated service:

```text
services/google-calendar/
```

It should handle:

```text
getCalendarEvents()
getTodayEvents()
getEventsBetween()
```

Do not scatter Google API calls throughout React components.

---

# 4. Today's Events

Fetch events for today.

Display:

```text
Today's Calendar

10:00 - 16:00
AI Agent Project

17:00 - 18:00
System Design
```

---

# 5. Calendar → Task

Allow the user to convert a Calendar event into a task.

Example:

```text
Calendar Event

AI Agent Project
10:00 - 16:00

[ Plan as Task ]
```

Creates:

```text
Task:
AI Agent Project

Allocated:
6 hours
```

Store the external calendar event ID.

---

# 6. Sync

Avoid aggressive polling.

Implement explicit refresh.

Later phases may introduce smarter synchronization.

---

# 7. Failure Handling

If Google Calendar fails:

```text
Calendar unavailable

Your locally created tasks and Pomodoro timer
will continue working.
```

The timer must not depend on Calendar availability.

---

# Acceptance Criteria

- Google account can authenticate
- Calendar API is enabled
- today's events can be retrieved
- events display correctly
- event can become a task
- external event ID is stored
- Calendar failures do not break the application
- secrets are not exposed