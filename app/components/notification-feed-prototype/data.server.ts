// PROTOTYPE (throwaway): Notification Feed — wayfinder ticket #11.
// Builds fake Notifications for the current user from real seed names, so the
// variants read like Cadence. Nothing is persisted; nothing talks to Knock.
import { db } from "~/db";
import { users, courses, lessons, UserRole } from "~/db/schema";

export type ProtoNotificationKind =
  | "refund_opened"
  | "refund_approved"
  | "refund_declined"
  | "seat_claimed"
  | "question_asked"
  | "reply_posted";

// Shape mirrors a Knock FeedItem: seen_at / read_at / archived_at are the
// three per-item states Knock tracks.
export interface ProtoNotification {
  id: string;
  kind: ProtoNotificationKind;
  title: string;
  detail?: string;
  href: string;
  insertedAt: string;
  seenAt: string | null;
  readAt: string | null;
  archivedAt: string | null;
}

const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString();

export function getPrototypeNotifications(
  role: UserRole | null,
  isTeamAdmin: boolean
): { initial: ProtoNotification[]; incoming: ProtoNotification[] } {
  const people = db.select({ name: users.name }).from(users).limit(12).all();
  const courseRows = db
    .select({ title: courses.title, slug: courses.slug })
    .from(courses)
    .limit(4)
    .all();
  const lessonRows = db
    .select({ id: lessons.id, title: lessons.title })
    .from(lessons)
    .limit(6)
    .all();

  const person = (i: number) => people[i % people.length]?.name ?? "Someone";
  const course = (i: number) =>
    courseRows[i % courseRows.length] ?? { title: "A course", slug: "x" };
  const lesson = (i: number) =>
    lessonRows[i % lessonRows.length] ?? { id: 1, title: "A lesson" };

  let n = 0;
  const make = (
    kind: ProtoNotificationKind,
    title: string,
    href: string,
    ago: number,
    state: "unseen" | "seen" | "read",
    detail?: string
  ): ProtoNotification => ({
    id: `proto-${n++}`,
    kind,
    title,
    detail,
    href,
    insertedAt: minutesAgo(ago),
    seenAt: state === "unseen" ? null : minutesAgo(ago - 1),
    readAt: state === "read" ? minutesAgo(ago - 1) : null,
    archivedAt: null,
  });

  const initial: ProtoNotification[] = [];
  const incoming: ProtoNotification[] = [];

  if (role === UserRole.Admin) {
    initial.push(
      make("refund_opened", `${person(1)} asked for a refund on ${course(0).title}`, "/admin/refunds", 4, "unseen"),
      make("refund_opened", `${person(2)} asked for a refund on ${course(1).title}`, "/admin/refunds", 95, "seen"),
      make("refund_opened", `${person(3)} asked for a refund on ${course(2).title}`, "/admin/refunds", 60 * 26, "read")
    );
    incoming.push(
      make("refund_opened", `${person(4)} asked for a refund on ${course(3).title}`, "/admin/refunds", 0, "unseen"),
      make("refund_opened", `${person(5)} asked for a refund on ${course(0).title}`, "/admin/refunds", 0, "unseen")
    );
  }

  if (role === UserRole.Instructor) {
    initial.push(
      make("question_asked", `${person(1)} asked a question on ${lesson(0).title}`, `/instructor/questions`, 12, "unseen", "“Why does the second example re-render twice?”"),
      make("question_asked", `${person(2)} asked a question on ${lesson(1).title}`, `/instructor/questions`, 40, "unseen", "“Is there a transcript for this video?”"),
      make("reply_posted", `${person(3)} replied to your question on ${lesson(2).title}`, `/instructor/questions`, 60 * 5, "seen"),
      make("question_asked", `${person(4)} asked a question on ${lesson(3).title}`, `/instructor/questions`, 60 * 30, "read")
    );
    incoming.push(
      make("question_asked", `${person(5)} asked a question on ${lesson(4).title}`, `/instructor/questions`, 0, "unseen", "“Where do I find the starter files?”"),
      make("question_asked", `${person(6)} asked a question on ${lesson(5).title}`, `/instructor/questions`, 0, "unseen")
    );
  }

  if (role === UserRole.Student || isTeamAdmin) {
    initial.push(
      make("reply_posted", `${person(1)} replied to your question on ${lesson(0).title}`, `/courses/${course(0).slug}`, 7, "unseen", "“Good catch — the hook runs once per dependency change.”"),
      make("refund_declined", `Your refund request for ${course(1).title} was declined`, `/courses/${course(1).slug}`, 60 * 3, "seen", "Decision note: more than 60% of the course was completed."),
      make("refund_approved", `Your refund request for ${course(2).title} was approved`, `/courses/${course(2).slug}`, 60 * 50, "read")
    );
    incoming.push(
      make("reply_posted", `${person(2)} replied to your question on ${lesson(1).title}`, `/courses/${course(0).slug}`, 0, "unseen")
    );
  }

  if (isTeamAdmin) {
    initial.unshift(
      make("seat_claimed", `${person(6)} claimed a seat on ${course(0).title} (7 of 10 used)`, "/team", 2, "unseen"),
      make("seat_claimed", `${person(7)} claimed a seat on ${course(0).title} (6 of 10 used)`, "/team", 3, "unseen"),
      make("seat_claimed", `${person(8)} claimed a seat on ${course(0).title} (5 of 10 used)`, "/team", 5, "unseen")
    );
    incoming.unshift(
      make("seat_claimed", `${person(9)} claimed a seat on ${course(0).title} (8 of 10 used)`, "/team", 0, "unseen")
    );
  }

  initial.sort((a, b) => b.insertedAt.localeCompare(a.insertedAt));
  return { initial, incoming };
}
