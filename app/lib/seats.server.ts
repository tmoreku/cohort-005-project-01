import { and, eq } from "drizzle-orm";
import type { Db } from "~/db";
import { coupons, courses, enrollments, purchases } from "~/db/schema";
import { getSeatAvailability } from "~/lib/refunds.server";
import type { NotificationToSend } from "~/lib/notifier.server";
import { getUser, toActor, toRecipient } from "~/lib/notification-people.server";

// ─── Seats ───
// A Student claiming a Seat on a Team Licence. Claiming gives them an
// Enrollment and returns the Seat claimed Notification for the Team Admin who
// bought the Team Licence (never when that Team Admin claimed it themselves).
//
// Takes the database first, so tests can hand in an in-memory one.

export const SEAT_ON_HOLD =
  "This seat can't be claimed right now. Ask the person who shared it with you.";
export const SEAT_REFUNDED =
  "This seat is no longer available. Ask the person who shared it with you.";

type Enrollment = typeof enrollments.$inferSelect;

export type ClaimSeatResult =
  | {
      ok: true;
      enrollment: Enrollment;
      courseSlug: string;
      notification: NotificationToSend | null;
    }
  | { ok: false; error: string };

/** The stable id of a Seat's row on Team, used as the Notification target. */
export function seatRowId(seatId: number): string {
  return `seat-${seatId}`;
}

/** Team, filtered to the course, with the Seat's row highlighted. */
export function seatUrl(courseId: number, seatId: number): string {
  return `/team?course=${courseId}#${seatRowId(seatId)}`;
}

const SEAT_NOT_FOUND = "This seat doesn't exist.";

/**
 * Whether this person can get Seat claimed Notifications: they bought a Team
 * Licence (a Purchase with Seats). The same rule claimSeat uses to pick the
 * recipient, so Settings offers the preference to exactly those people.
 */
export function receivesSeatClaimed(db: Db, userId: number): boolean {
  const seat = db
    .select({ id: coupons.id })
    .from(coupons)
    .innerJoin(purchases, eq(coupons.purchaseId, purchases.id))
    .where(eq(purchases.userId, userId))
    .get();
  return seat !== undefined;
}

export function claimSeat(
  db: Db,
  code: string,
  userId: number,
  userCountry: string,
  now: Date
): ClaimSeatResult {
  const seat = db.select().from(coupons).where(eq(coupons.code, code)).get();
  if (!seat) {
    return { ok: false, error: SEAT_NOT_FOUND };
  }

  if (seat.redeemedByUserId !== null) {
    return { ok: false, error: "This seat has already been claimed." };
  }

  const availability = getSeatAvailability(db, seat);
  if (availability === "on_hold") return { ok: false, error: SEAT_ON_HOLD };
  if (availability === "refunded") return { ok: false, error: SEAT_REFUNDED };

  const existingEnrollment = db
    .select()
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, seat.courseId))
    )
    .get();
  if (existingEnrollment) {
    return { ok: false, error: "You are already enrolled in this course" };
  }

  const licence = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, seat.purchaseId))
    .get();
  if (!licence) {
    return { ok: false, error: SEAT_NOT_FOUND };
  }

  if (licence.country && licence.country !== userCountry) {
    return {
      ok: false,
      error:
        "This seat can only be claimed from the same country as the person who bought it.",
    };
  }

  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, seat.courseId))
    .get();
  if (!course) {
    return { ok: false, error: "Course not found" };
  }

  const claimedAt = now.toISOString();
  const enrollment = db.transaction((tx) => {
    tx.update(coupons)
      .set({ redeemedByUserId: userId, redeemedAt: claimedAt })
      .where(eq(coupons.id, seat.id))
      .run();
    return tx
      .insert(enrollments)
      .values({ userId, courseId: seat.courseId })
      .returning()
      .get();
  });

  return {
    ok: true,
    enrollment,
    courseSlug: course.slug,
    notification: buildSeatClaimedNotification(db, licence.userId, userId, {
      seatId: seat.id,
      purchaseId: licence.id,
      courseId: course.id,
      courseTitle: course.title,
      claimedAt,
    }),
  };
}

function buildSeatClaimedNotification(
  db: Db,
  teamAdminId: number,
  studentId: number,
  claimed: {
    seatId: number;
    purchaseId: number;
    courseId: number;
    courseTitle: string;
    claimedAt: string;
  }
): NotificationToSend | null {
  // Never notify the actor.
  if (teamAdminId === studentId) return null;

  const seats = db
    .select({ redeemedByUserId: coupons.redeemedByUserId })
    .from(coupons)
    .where(eq(coupons.purchaseId, claimed.purchaseId))
    .all();
  const seatsTotal = seats.length;
  const seatsUsed = seats.filter((s) => s.redeemedByUserId !== null).length;

  const teamAdmin = getUser(db, teamAdminId);
  const student = getUser(db, studentId);
  if (!teamAdmin || !student) return null;

  return {
    kind: "seat-claimed",
    recipients: [toRecipient(teamAdmin)],
    actor: toActor(student),
    url: seatUrl(claimed.courseId, claimed.seatId),
    data: {
      studentName: student.name,
      studentEmail: student.email,
      courseTitle: claimed.courseTitle,
      seatsUsed,
      seatsTotal,
      lastSeat: seatsUsed === seatsTotal,
      claimedAt: claimed.claimedAt,
    },
  };
}
