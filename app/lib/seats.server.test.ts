import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { claimSeat } from "./seats.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

function addStudent(name: string) {
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

function buyTeamLicence(teamAdminId: number, seatCount: number) {
  const team = db.insert(schema.teams).values({}).returning().get();
  db.insert(schema.teamMembers)
    .values({
      teamId: team.id,
      userId: teamAdminId,
      role: schema.TeamMemberRole.Admin,
    })
    .run();
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId: teamAdminId,
      courseId: base.course.id,
      amountPaid: 7900 * seatCount,
      country: "GB",
    })
    .returning()
    .get();
  const seats = Array.from({ length: seatCount }, (_, i) =>
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
  return { purchase, seats };
}

describe("claimSeat", () => {
  it("notifies the Team Admin who bought the Team Licence, with the Student as actor", () => {
    const teamAdmin = addStudent("Tess");
    const student = addStudent("Sam");
    const { seats } = buyTeamLicence(teamAdmin.id, 3);

    const result = claimSeat(db, seats[0].code, student.id, "GB", NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notification?.kind).toBe("seat-claimed");
    expect(result.notification?.recipients.map((r) => r.id)).toEqual([
      teamAdmin.id,
    ]);
    expect(result.notification?.actor).toEqual({
      id: student.id,
      name: "Sam",
      avatarUrl: null,
    });
  });

  it("sends nothing when the Team Admin claims a Seat on their own Team Licence", () => {
    const teamAdmin = addStudent("Tess");
    const { seats } = buyTeamLicence(teamAdmin.id, 3);

    const result = claimSeat(db, seats[0].code, teamAdmin.id, "GB", NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notification).toBeNull();
  });

  it("carries the Student, the course and how many of the Team Licence's Seats are used", () => {
    const teamAdmin = addStudent("Tess");
    const { seats } = buyTeamLicence(teamAdmin.id, 3);
    claimSeat(db, seats[0].code, addStudent("Ann").id, "GB", NOW);

    const result = claimSeat(db, seats[1].code, addStudent("Sam").id, "GB", NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notification?.data).toEqual({
      studentName: "Sam",
      studentEmail: "sam@example.com",
      courseTitle: "Test Course",
      seatsUsed: 2,
      seatsTotal: 3,
      lastSeat: false,
    });
  });

  it("shows the last Seat claimed as total of total", () => {
    const teamAdmin = addStudent("Tess");
    const { seats } = buyTeamLicence(teamAdmin.id, 2);
    claimSeat(db, seats[0].code, addStudent("Ann").id, "GB", NOW);

    const result = claimSeat(db, seats[1].code, addStudent("Sam").id, "GB", NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notification?.data).toMatchObject({
      seatsUsed: 2,
      seatsTotal: 2,
      lastSeat: true,
    });
  });

  it("links to Team, filtered to the course, at the Claimed Seat's row", () => {
    const teamAdmin = addStudent("Tess");
    const { seats } = buyTeamLicence(teamAdmin.id, 3);

    const result = claimSeat(db, seats[2].code, addStudent("Sam").id, "GB", NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notification?.url).toBe(
      `/team?course=${base.course.id}#seat-${seats[2].id}`
    );
  });

  it("counts only the Seats on the claimed Seat's own Team Licence", () => {
    const teamAdmin = addStudent("Tess");
    const first = buyTeamLicence(teamAdmin.id, 2);
    claimSeat(db, first.seats[0].code, addStudent("Ann").id, "GB", NOW);
    const second = buyTeamLicence(teamAdmin.id, 5);

    const result = claimSeat(db, second.seats[0].code, addStudent("Sam").id, "GB", NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notification?.data).toMatchObject({
      seatsUsed: 1,
      seatsTotal: 5,
    });
  });
});
