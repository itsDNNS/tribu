import { CalendarDays, MapPin, Users } from "lucide-react";
import { t } from "../../lib/i18n";
import { parseDate } from "../../lib/helpers";
import MemberAvatar from "../MemberAvatar";
import { mapsLinksForLocation } from "./CalendarHelpers";

export const calendarDateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const isReadonlyEvent = (event) =>
  event._isBirthday || ["import", "subscription"].includes(event.source_type);

const dateKey = calendarDateKey;
const readonly = isReadonlyEvent;

// "A family moment": date and time, people, place and notes. The calendar
// adds edit and delete; Today shows it with a way into the calendar
// (Tribu 2.0, K5).
export default function EventDetails({
  event,
  members,
  messages,
  locale,
  timeFormat,
}) {
  const time = (value) => {
    const date = parseDate(value);
    return date
      ? date.toLocaleTimeString(locale, {
          hour: timeFormat === "12h" ? "numeric" : "2-digit",
          minute: "2-digit",
          hour12: timeFormat === "12h",
        })
      : "";
  };
  const participants = (entry) =>
    entry.assigned_to === "all"
      ? members
      : members.filter(
          (m) =>
            Array.isArray(entry.assigned_to) &&
            entry.assigned_to.map(String).includes(String(m.user_id)),
        );
  const lastAllDayDate =
    event.all_day && event.ends_at
      ? new Date(new Date(event.ends_at).getTime() - 1)
      : null;
  const mapLinks = mapsLinksForLocation(event.location);
  return (
    <>
      <h3 className="tc-detail-title">{event.title}</h3>
      <div className="tc-detail-line">
        <CalendarDays size={20} />
        <div>
          <strong>
            {parseDate(event.starts_at)?.toLocaleDateString(locale, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {lastAllDayDate &&
            dateKey(lastAllDayDate) !== dateKey(parseDate(event.starts_at))
              ? ` – ${lastAllDayDate.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}`
              : ""}
          </strong>
          <p>
            {event.all_day ? t(messages, "all_day") : time(event.starts_at)}
            {!event.all_day && event.ends_at
              ? ` – ${dateKey(parseDate(event.ends_at)) !== dateKey(parseDate(event.starts_at)) ? parseDate(event.ends_at).toLocaleDateString(locale) + " " : ""}${time(event.ends_at)}`
              : ""}
          </p>
        </div>
      </div>
      <div className="tc-detail-line">
        <Users size={20} />
        <div className="tc-people">
          {participants(event).length
            ? participants(event).map((member) => (
                <span key={member.user_id}>
                  <MemberAvatar member={member} size={24} />
                  {member.display_name}
                </span>
              ))
            : t(messages, "module.tasks.unassigned")}
        </div>
      </div>
      {event.location && (
        <div className="tc-detail-line">
          <MapPin size={20} />
          <div>
            {event.location}
            {mapLinks && (
              <p>
                <a href={mapLinks.google} target="_blank" rel="noreferrer">
                  {t(messages, "module.calendar.open_google_maps")}
                </a>{" "}
                ·{" "}
                <a
                  href={mapLinks.openStreetMap}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t(messages, "module.calendar.open_openstreetmap")}
                </a>
              </p>
            )}
          </div>
        </div>
      )}
      {event.description && (
        <p className="tc-detail-description">{event.description}</p>
      )}
      {readonly(event) && !event._isBirthday && (
        <p className="tc-form-hint">
          {t(messages, "module.calendar.source_readonly_hint")}
        </p>
      )}
    </>
  );
}
