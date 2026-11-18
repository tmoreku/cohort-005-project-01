import { describe, it, expect, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { LessonProgressStatus, RefundStatus, UserRole } from "~/db/schema";
import {
  approveRefundRequest,
  checkRefundRequest,
  declineRefundRequest,
  findRefundRequestStatus,
  getRefundOffer,
  getSeatAvailability,
  listRefundRequestsForBuyer,
  listRefundRequestsForReview,
  listTeamLicences,
  raiseRefundRequest,
} from "./refunds.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

function daysBefore(days: number) {
  const when = new Date(NOW);
  when.setDate(when.getDate() - days);
  return when.toISOString();
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let platformAdmin: typeof schema.users.$inferSelect;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  platformAdmin = db
    .insert(schema.users)
    .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
    .returning()
    .get();

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2, 3, 4].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

function addLearner(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

function buyForSelf(userId: number, daysAgo = 3, amountPaid = 7900) {
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId,
      courseId: base.course.id,
      amountPaid,
      createdAt: daysBefore(daysAgo),
    })
    .returning()
    .get();
  db.insert(schema.enrollments)
    .values({ userId, courseId: base.course.id })
    .run();
  return purchase;
}

function buySeats(userId: number, seats: number, daysAgo = 3) {
  const team = db.insert(schema.teams).values({}).returning().get();
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId,
      courseId: base.course.id,
      amountPaid: 7900 * seats,
      createdAt: daysBefore(daysAgo),
    })
    .returning()
    .get();
  const seatRows = Array.from({ length: seats }, (_, i) =>
    db
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: `SEAT-${purchase.id}-${i}`,
        purchaseId: purchase.id,
      })
      .returning()
      .get()
  );
  return { purchase, seats: seatRows };
}

function claimSeat(seatId: number, userId: number) {
  db.update(schema.coupons)
    .set({ redeemedByUserId: userId, redeemedAt: daysBefore(1) })
    .where(eq(schema.coupons.id, seatId))
    .run();
  db.insert(schema.enrollments)
    .values({ userId, courseId: base.course.id })
    .run();
}

function isEnrolled(userId: number) {
  return !!db
    .select()
    .from(schema.enrollments)
    .where(
      and(
        eq(schema.enrollments.userId, userId),
        eq(schema.enrollments.courseId, base.course.id)
      )
    )
    .get();
}

function raise(purchaseId: number, buyerId: number) {
  const result = raiseRefundRequest(
    db,
    purchaseId,
    buyerId,
    "It was not what I expected.",
    NOW
  );
  if (!result.ok) throw new Error(result.error);
  return result.refundRequestId;
}

function getSeat(seatId: number) {
  const seat = db
    .select()
    .from(schema.coupons)
    .where(eq(schema.coupons.id, seatId))
    .get();
  if (!seat) throw new Error("Seat not found");
  return seat;
}

describe("raising a Refund Request", () => {
  it("lets the buyer raise one on an Individual Purchase inside the window", () => {
    const purchase = buyForSelf(base.user.id);

    const result = raiseRefundRequest(db, purchase.id, base.user.id, "Nope.", NOW);

    expect(result).toMatchObject({ ok: true, kind: "individual_purchase" });
  });

  it("refuses anyone but the buyer", () => {
    const purchase = buyForSelf(base.user.id);
    const someoneElse = addLearner("Ben");

    expect(checkRefundRequest(db, purchase.id, someoneElse.id, NOW)).toMatchObject(
      { ok: false, status: 404 }
    );
  });

  it("allows only one Open Refund Request per Purchase", () => {
    const purchase = buyForSelf(base.user.id);
    raise(purchase.id, base.user.id);

    expect(checkRefundRequest(db, purchase.id, base.user.id, NOW)).toMatchObject(
      { ok: false, status: 409 }
    );
  });

  it("keeps the fourteenth day open and closes the fifteenth", () => {
    const onDay14 = buyForSelf(base.user.id, 14);
    const onDay15 = buyForSelf(addLearner("Ben").id, 15);

    expect(checkRefundRequest(db, onDay14.id, onDay14.userId, NOW).ok).toBe(true);
    expect(
      checkRefundRequest(db, onDay15.id, onDay15.userId, NOW)
    ).toMatchObject({ ok: false, error: "The 14-day window has closed." });
  });

  it("refuses a buyer who has completed half the lessons", () => {
    const purchase = buyForSelf(base.user.id);
    db.insert(schema.lessonProgress)
      .values(
        lessonIds.slice(0, 2).map((lessonId) => ({
          userId: base.user.id,
          lessonId,
          status: LessonProgressStatus.Completed,
        }))
      )
      .run();

    expect(checkRefundRequest(db, purchase.id, base.user.id, NOW)).toMatchObject(
      { ok: false, status: 403 }
    );
  });

  it("refuses a buyer who has watched two hours", () => {
    const purchase = buyForSelf(base.user.id);
    db.insert(schema.videoWatchEvents)
      .values([
        { userId: base.user.id, lessonId: lessonIds[0], eventType: "progress", positionSeconds: 3600 },
        { userId: base.user.id, lessonId: lessonIds[1], eventType: "progress", positionSeconds: 3600 },
      ])
      .run();

    expect(checkRefundRequest(db, purchase.id, base.user.id, NOW)).toMatchObject(
      { ok: false, status: 403 }
    );
  });

  it("refuses a Team Licence with a Claimed Seat", () => {
    const teamAdmin = addLearner("Priya");
    const { purchase, seats } = buySeats(teamAdmin.id, 3);
    claimSeat(seats[0].id, addLearner("Ben").id);

    expect(checkRefundRequest(db, purchase.id, teamAdmin.id, NOW)).toMatchObject({
      ok: false,
      status: 403,
    });
  });
});

describe("the Refund request received Notification", () => {
  it("is the buyer's receipt for an Individual Purchase, linking to Settings", () => {
    const purchase = buyForSelf(base.user.id);

    const result = raiseRefundRequest(
      db,
      purchase.id,
      base.user.id,
      "It was not what I expected.",
      NOW
    );

    if (!result.ok) throw new Error(result.error);
    expect(result.notifications[0]).toEqual(
      {
        kind: "refund-request-received",
        recipients: [
          {
            id: base.user.id,
            name: "Test User",
            email: "test@example.com",
            timezone: null,
            locale: null,
          },
        ],
        actor: { id: base.user.id, name: "Test User", avatarUrl: null },
        url: `/settings#refund-request-${result.refundRequestId}`,
        data: {
          courseTitle: "Test Course",
          amount: "$79.00",
          reason: "It was not what I expected.",
          requestedAt: NOW.toISOString(),
        },
      }
    );
  });

  it("links a Team Licence to its card on Team", () => {
    const priya = addLearner("Priya");
    const { purchase } = buySeats(priya.id, 2);

    const result = raiseRefundRequest(db, purchase.id, priya.id, "Too many.", NOW);

    if (!result.ok) throw new Error(result.error);
    expect(result.notifications[0]).toMatchObject({
      kind: "refund-request-received",
      recipients: [{ id: priya.id }],
      url: `/team#team-licence-${purchase.id}`,
      data: { amount: "$158.00" },
    });
  });
});

describe("the Refund Request opened Notification", () => {
  function openedNotification(result: ReturnType<typeof raiseRefundRequest>) {
    if (!result.ok) throw new Error(result.error);
    return result.notifications.find(
      (notification) => notification.kind === "refund-request-opened"
    );
  }

  it("goes to every Platform Admin, linking to the request on the admin page", () => {
    const secondAdmin = db
      .insert(schema.users)
      .values({ name: "Sam Admin", email: "sam@example.com", role: UserRole.Admin })
      .returning()
      .get();
    const purchase = buyForSelf(base.user.id, 3);

    const result = raiseRefundRequest(
      db,
      purchase.id,
      base.user.id,
      "It was not what I expected.",
      NOW
    );

    if (!result.ok) throw new Error(result.error);
    expect(openedNotification(result)).toEqual({
      kind: "refund-request-opened",
      recipients: [
        {
          id: platformAdmin.id,
          name: "Pat Admin",
          email: "pat@example.com",
          timezone: null,
          locale: null,
        },
        {
          id: secondAdmin.id,
          name: "Sam Admin",
          email: "sam@example.com",
          timezone: null,
          locale: null,
        },
      ],
      actor: { id: base.user.id, name: "Test User", avatarUrl: null },
      url: `/admin/refunds?request=${result.refundRequestId}`,
      data: {
        buyerName: "Test User",
        buyerEmail: "test@example.com",
        courseTitle: "Test Course",
        amount: "$79.00",
        purchaseType: "Individual Purchase",
        reason: "It was not what I expected.",
        boughtAt: daysBefore(3),
        requestedAt: NOW.toISOString(),
      },
    });
  });

  it("says a Team Licence is one", () => {
    const priya = addLearner("Priya");
    const { purchase } = buySeats(priya.id, 2);

    const result = raiseRefundRequest(db, purchase.id, priya.id, "Too many.", NOW);

    expect(openedNotification(result)).toMatchObject({
      actor: { id: priya.id },
      data: { buyerName: "Priya", purchaseType: "Team Licence", amount: "$158.00" },
    });
  });

  it("never goes to the buyer, even when the buyer is a Platform Admin", () => {
    const otherAdmin = db
      .insert(schema.users)
      .values({ name: "Sam Admin", email: "sam@example.com", role: UserRole.Admin })
      .returning()
      .get();
    const purchase = buyForSelf(platformAdmin.id);

    const result = raiseRefundRequest(db, purchase.id, platformAdmin.id, "Oops.", NOW);

    expect(openedNotification(result)?.recipients).toEqual([
      expect.objectContaining({ id: otherAdmin.id }),
    ]);
  });

  it("isn't sent when the buyer is the only Platform Admin", () => {
    const purchase = buyForSelf(platformAdmin.id);

    const result = raiseRefundRequest(db, purchase.id, platformAdmin.id, "Oops.", NOW);

    expect(openedNotification(result)).toBeUndefined();
  });
});

describe("the refund offer on the course page", () => {
  it("offers the newest Individual Purchase, not a newer Team Licence", () => {
    const individual = buyForSelf(base.user.id, 3);
    buySeats(base.user.id, 5, 1);

    expect(getRefundOffer(db, base.user.id, base.course.id, NOW)).toMatchObject({
      purchaseId: individual.id,
      amount: 7900,
    });
  });

  it("offers nothing once the purchase has been refunded", () => {
    const purchase = buyForSelf(base.user.id);
    const id = raise(purchase.id, base.user.id);
    approveRefundRequest(db, id, platformAdmin.id, null, NOW);

    expect(getRefundOffer(db, base.user.id, base.course.id, NOW)).toBeNull();
  });
});

describe("approving a Refund Request", () => {
  it("removes the buyer's Enrollment but keeps their progress", () => {
    const purchase = buyForSelf(base.user.id);
    db.insert(schema.lessonProgress)
      .values({
        userId: base.user.id,
        lessonId: lessonIds[0],
        status: LessonProgressStatus.Completed,
      })
      .run();
    const id = raise(purchase.id, base.user.id);

    const result = approveRefundRequest(db, id, platformAdmin.id, null, NOW);

    expect(result.ok).toBe(true);
    expect(isEnrolled(base.user.id)).toBe(false);
    expect(
      db
        .select()
        .from(schema.lessonProgress)
        .where(eq(schema.lessonProgress.userId, base.user.id))
        .all()
    ).toHaveLength(1);

    const refundRequest = db
      .select()
      .from(schema.refunds)
      .where(eq(schema.refunds.id, id))
      .get();
    expect(refundRequest).toMatchObject({
      status: RefundStatus.Approved,
      amountRefunded: 7900,
      resolvedByUserId: platformAdmin.id,
    });
  });

  it("keeps the buyer's Enrollment if they also hold a Claimed Seat for the course", () => {
    const priya = addLearner("Priya");
    const { seats } = buySeats(priya.id, 2);
    // Liam claims a Seat first, so his Enrollment came from it.
    claimSeat(seats[0].id, base.user.id);
    const purchase = db
      .insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 7900,
        createdAt: daysBefore(2),
      })
      .returning()
      .get();
    const id = raise(purchase.id, base.user.id);

    approveRefundRequest(db, id, platformAdmin.id, null, NOW);

    expect(isEnrolled(base.user.id)).toBe(true);
  });

  it("makes a Team Licence's Unclaimed Seats unclaimable", () => {
    const priya = addLearner("Priya");
    const { purchase, seats } = buySeats(priya.id, 2);
    const id = raise(purchase.id, priya.id);

    const result = approveRefundRequest(db, id, platformAdmin.id, null, NOW);

    expect(result.ok).toBe(true);
    for (const seat of seats) {
      expect(getSeatAvailability(db, getSeat(seat.id))).toBe("refunded");
    }
  });

  it("refuses a Team Licence whose Seat was claimed after the request", () => {
    const priya = addLearner("Priya");
    const { purchase, seats } = buySeats(priya.id, 2);
    const id = raise(purchase.id, priya.id);
    // Seats are on hold while Open, but older data can still hold a claim.
    claimSeat(seats[0].id, addLearner("Ben").id);

    expect(approveRefundRequest(db, id, platformAdmin.id, null, NOW)).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(getSeatAvailability(db, getSeat(seats[1].id))).toBe("on_hold");
  });

  it("lets the first decision win", () => {
    const purchase = buyForSelf(base.user.id);
    const id = raise(purchase.id, base.user.id);
    approveRefundRequest(db, id, platformAdmin.id, null, NOW);

    expect(
      declineRefundRequest(db, id, platformAdmin.id, "Too late.", NOW)
    ).toMatchObject({
      ok: false,
      status: 409,
      error: "This refund request was already approved.",
    });
  });

  it("notifies the buyer, signed by the deciding Platform Admin", () => {
    const purchase = buyForSelf(base.user.id);
    const id = raise(purchase.id, base.user.id);

    const result = approveRefundRequest(
      db,
      id,
      platformAdmin.id,
      "Sorry it wasn't the right fit.",
      NOW
    );

    if (!result.ok) throw new Error(result.error);
    expect(result.notification).toEqual({
      kind: "refund-request-approved",
      recipients: [
        {
          id: base.user.id,
          name: "Test User",
          email: "test@example.com",
          timezone: null,
          locale: null,
        },
      ],
      actor: { id: platformAdmin.id, name: "Pat Admin", avatarUrl: null },
      url: `/settings#refund-request-${id}`,
      data: {
        platformAdminName: "Pat Admin",
        courseTitle: "Test Course",
        amount: "$79.00",
        reason: "It was not what I expected.",
        note: "Sorry it wasn't the right fit.",
        decidedAt: NOW.toISOString(),
      },
    });
  });

  it("sends a null note when the Platform Admin wrote none", () => {
    const purchase = buyForSelf(base.user.id);
    const id = raise(purchase.id, base.user.id);

    const result = approveRefundRequest(db, id, platformAdmin.id, null, NOW);

    if (!result.ok) throw new Error(result.error);
    expect(result.notification.data.note).toBeNull();
  });

  it("links a Team Licence's approval to its card on Team", () => {
    const priya = addLearner("Priya");
    const { purchase } = buySeats(priya.id, 1);
    const id = raise(purchase.id, priya.id);

    const result = approveRefundRequest(db, id, platformAdmin.id, null, NOW);

    if (!result.ok) throw new Error(result.error);
    expect(result.notification).toMatchObject({
      recipients: [{ id: priya.id }],
      url: `/team#team-licence-${purchase.id}`,
    });
  });
});

describe("declining a Refund Request", () => {
  it("needs a note", () => {
    const purchase = buyForSelf(base.user.id);
    const id = raise(purchase.id, base.user.id);

    expect(declineRefundRequest(db, id, platformAdmin.id, "  ", NOW)).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("keeps the buyer's Enrollment and lets them raise a new Refund Request", () => {
    const purchase = buyForSelf(base.user.id);
    const id = raise(purchase.id, base.user.id);

    const result = declineRefundRequest(
      db,
      id,
      platformAdmin.id,
      "You finished the course.",
      NOW
    );

    if (!result.ok) throw new Error(result.error);
    expect(isEnrolled(base.user.id)).toBe(true);
    expect(checkRefundRequest(db, purchase.id, base.user.id, NOW).ok).toBe(true);
  });

  it("notifies the buyer with the trimmed note, signed by the deciding Platform Admin", () => {
    const purchase = buyForSelf(base.user.id);
    const id = raise(purchase.id, base.user.id);

    const result = declineRefundRequest(
      db,
      id,
      platformAdmin.id,
      "  You finished the course.  ",
      NOW
    );

    if (!result.ok) throw new Error(result.error);
    expect(result.notification).toEqual({
      kind: "refund-request-declined",
      recipients: [
        {
          id: base.user.id,
          name: "Test User",
          email: "test@example.com",
          timezone: null,
          locale: null,
        },
      ],
      actor: { id: platformAdmin.id, name: "Pat Admin", avatarUrl: null },
      url: `/settings#refund-request-${id}`,
      data: {
        platformAdminName: "Pat Admin",
        courseTitle: "Test Course",
        amount: "$79.00",
        reason: "It was not what I expected.",
        note: "You finished the course.",
        decidedAt: NOW.toISOString(),
      },
    });
  });

  it("links a Team Licence's decline to its card on Team", () => {
    const priya = addLearner("Priya");
    const { purchase } = buySeats(priya.id, 1);
    const id = raise(purchase.id, priya.id);

    const result = declineRefundRequest(
      db,
      id,
      platformAdmin.id,
      "Seats are in use.",
      NOW
    );

    if (!result.ok) throw new Error(result.error);
    expect(result.notification).toMatchObject({
      kind: "refund-request-declined",
      recipients: [{ id: priya.id }],
      actor: { id: platformAdmin.id },
      url: `/team#team-licence-${purchase.id}`,
    });
  });

  it("frees a Team Licence's Seats again", () => {
    const priya = addLearner("Priya");
    const { purchase, seats } = buySeats(priya.id, 1);
    const id = raise(purchase.id, priya.id);
    expect(getSeatAvailability(db, getSeat(seats[0].id))).toBe("on_hold");

    declineRefundRequest(db, id, platformAdmin.id, "Seats are in use.", NOW);

    expect(getSeatAvailability(db, getSeat(seats[0].id))).toBe("available");
  });
});

describe("listing Refund Requests", () => {
  it("shows a Platform Admin live figures and the rules a request breaks", () => {
    const purchase = buyForSelf(base.user.id);
    const id = raise(purchase.id, base.user.id);
    // Since raising the request, the buyer has finished half the course.
    db.insert(schema.lessonProgress)
      .values(
        lessonIds.slice(0, 2).map((lessonId) => ({
          userId: base.user.id,
          lessonId,
          status: LessonProgressStatus.Completed,
        }))
      )
      .run();

    const [row] = listRefundRequestsForReview(db, RefundStatus.Open, NOW);

    expect(row).toMatchObject({
      id,
      buyerName: "Test User",
      daysSincePurchase: 3,
      figures: {
        kind: "individual_purchase",
        lessonsCompleted: 2,
        lessonCount: 4,
      },
      ruleBreaks: ["completed_too_much"],
      canApprove: true,
    });
  });

  it("shows a Team Licence's Seats instead of the buyer's progress", () => {
    const priya = addLearner("Priya");
    const { purchase } = buySeats(priya.id, 3);
    raise(purchase.id, priya.id);

    const [row] = listRefundRequestsForReview(db, RefundStatus.Open, NOW);

    expect(row.figures).toEqual({
      kind: "team_licence",
      seatCount: 3,
      claimedSeatCount: 0,
    });
  });

  it("lists only the requested status, oldest first", () => {
    const first = buyForSelf(base.user.id);
    const ben = addLearner("Ben");
    const second = buyForSelf(ben.id);
    const firstId = raise(first.id, base.user.id);
    const secondId = raiseRefundRequest(
      db,
      second.id,
      ben.id,
      "Changed my mind.",
      new Date(NOW.getTime() + 60_000)
    );
    if (!secondId.ok) throw new Error(secondId.error);

    expect(
      listRefundRequestsForReview(db, RefundStatus.Open, NOW).map((r) => r.id)
    ).toEqual([firstId, secondId.refundRequestId]);

    approveRefundRequest(db, firstId, platformAdmin.id, null, NOW);

    expect(
      listRefundRequestsForReview(db, RefundStatus.Approved, NOW)
    ).toMatchObject([{ id: firstId, decidedByName: "Pat Admin" }]);
  });

  it("shows a buyer their decided requests with the decline note", () => {
    const purchase = buyForSelf(base.user.id);
    const id = raise(purchase.id, base.user.id);
    declineRefundRequest(db, id, platformAdmin.id, "Past half way.", NOW);

    expect(listRefundRequestsForBuyer(db, base.user.id)).toMatchObject([
      { id, status: RefundStatus.Declined, decisionNote: "Past half way." },
    ]);
  });

  it("lists a Team Admin's Team Licences and whether each can be refunded", () => {
    const priya = addLearner("Priya");
    buySeats(priya.id, 2);
    const { seats } = buySeats(priya.id, 2);
    claimSeat(seats[0].id, addLearner("Ben").id);

    expect(listTeamLicences(db, priya.id, NOW)).toMatchObject([
      { seatCount: 2, claimedSeatCount: 1, canRequestRefund: false },
      { seatCount: 2, claimedSeatCount: 0, canRequestRefund: true },
    ]);
  });
});

describe("opening a Refund Request from a Notification", () => {
  it("finds the tab a request is on now: open, approved or declined", () => {
    const open = raise(buyForSelf(base.user.id).id, base.user.id);
    const ben = addLearner("Ben");
    const approved = raise(buyForSelf(ben.id).id, ben.id);
    const cleo = addLearner("Cleo");
    const declined = raise(buyForSelf(cleo.id).id, cleo.id);
    approveRefundRequest(db, approved, platformAdmin.id, null, NOW);
    declineRefundRequest(db, declined, platformAdmin.id, "No.", NOW);

    expect(findRefundRequestStatus(db, open)).toBe(RefundStatus.Open);
    expect(findRefundRequestStatus(db, approved)).toBe(RefundStatus.Approved);
    expect(findRefundRequestStatus(db, declined)).toBe(RefundStatus.Declined);
  });

  it("finds nothing for a request that doesn't exist", () => {
    expect(findRefundRequestStatus(db, 999)).toBeNull();
  });
});
