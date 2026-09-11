export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startMs: number;
  endMs: number;
  allDay: boolean;
  recurring: boolean;
  status: string;
}

/** Raw Google Calendar API item (minimal subset we use). */
export interface GoogleApiItem {
  id?: string;
  summary?: string;
  description?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  recurringEventId?: string;
}
