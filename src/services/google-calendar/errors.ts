export class CalendarUnavailableError extends Error {
  readonly status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.name = "CalendarUnavailableError";
    this.status = status;
  }
}

export class CalendarAuthError extends CalendarUnavailableError {
  constructor(message = "Google Calendar needs reconnect. Sign in again.") {
    super(message, 401);
    this.name = "CalendarAuthError";
  }
}
