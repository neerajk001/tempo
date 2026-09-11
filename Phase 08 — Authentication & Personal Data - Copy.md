# Phase 08 — Authentication & Personal Data

## Objective

Make the application properly user-specific.

Each user's tasks, sessions, and Calendar connection must be isolated.

---

# 1. Authentication

Use Google OAuth.

The application should support:

```text
Sign in with Google
Sign out
```

---

# 2. User Model

Create:

```text
User
```

Connect:

```text
User
 ├── Tasks
 ├── Sessions
 └── Calendar connection
```

---

# 3. Data Isolation

Every database query involving user-owned data must enforce ownership.

Never trust:

```text
userId
```

provided directly by the client.

Resolve the authenticated user server-side.

---

# 4. Protected Routes

Protect:

```text
/dashboard
/tasks
/calendar
/history
/settings
```

Unauthenticated users should be redirected to login.

---

# 5. Calendar Credentials

Calendar OAuth credentials/tokens must never be exposed to the browser unnecessarily.

Store sensitive credentials securely.

---

# 6. Logout

Logging out should:

- clear authentication state
- prevent access to protected data
- preserve database data

---

# Acceptance Criteria

- Google login works
- logout works
- protected routes work
- user data is isolated
- Calendar credentials are protected
- unauthenticated access is rejected