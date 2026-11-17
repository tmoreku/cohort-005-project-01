import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  deleteFromDiscussion,
  editInDiscussion,
  postToDiscussion,
} from "./discussions.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Closures, explained.", position: 1 })
    .returning()
    .get().id;
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: UserRole.Student,
      avatarUrl: `https://example.com/${name.toLowerCase()}.png`,
    })
    .returning()
    .get();
}

describe("asking a Discussion Question", () => {
  it("notifies the course's Instructor", () => {
    const student = addStudent("Ada");

    const { comment, notifications } = postToDiscussion(
      db,
      lessonId,
      student.id,
      null,
      "  Why does the counter keep its value?  "
    );

    expect(notifications).toEqual([
      {
        kind: "discussion-question-asked",
        recipients: [
          {
            id: base.instructor.id,
            name: "Test Instructor",
            email: "instructor@example.com",
            timezone: null,
            locale: null,
          },
        ],
        actor: {
          id: student.id,
          name: "Ada",
          avatarUrl: "https://example.com/ada.png",
        },
        url: `/courses/test-course/lessons/${lessonId}#discussion-question-${comment.id}`,
        data: {
          studentName: "Ada",
          courseTitle: "Test Course",
          lessonTitle: "Closures, explained.",
          questionBody: "Why does the counter keep its value?",
        },
      },
    ]);
  });
});

describe("asking a Discussion Question as the course's Instructor", () => {
  it("notifies nobody", () => {
    const { notifications } = postToDiscussion(
      db,
      lessonId,
      base.instructor.id,
      null,
      "A pinned question for everyone"
    );

    expect(notifications).toEqual([]);
  });
});

describe("posting a Discussion Reply", () => {
  it("notifies only the Discussion Question's author", () => {
    const asker = addStudent("Ada");
    const earlierReplier = addStudent("Grace");
    const replier = addStudent("Linus");
    const question = postToDiscussion(
      db,
      lessonId,
      asker.id,
      null,
      "Why does the counter keep its value?"
    ).comment;
    postToDiscussion(db, lessonId, earlierReplier.id, question.id, "Me too!");

    const { comment: reply, notifications } = postToDiscussion(
      db,
      lessonId,
      replier.id,
      question.id,
      "The inner function closes over it."
    );

    expect(notifications).toEqual([
      {
        kind: "discussion-reply",
        recipients: [
          {
            id: asker.id,
            name: "Ada",
            email: "ada@example.com",
            timezone: null,
            locale: null,
          },
        ],
        actor: {
          id: replier.id,
          name: "Linus",
          avatarUrl: "https://example.com/linus.png",
        },
        url: `/courses/test-course/lessons/${lessonId}#discussion-reply-${reply.id}`,
        data: {
          replierName: "Linus",
          courseTitle: "Test Course",
          lessonTitle: "Closures, explained.",
          questionBody: "Why does the counter keep its value?",
          replyBody: "The inner function closes over it.",
        },
      },
    ]);
  });

  it("notifies nobody when the author replies to their own question", () => {
    const asker = addStudent("Ada");
    const question = postToDiscussion(db, lessonId, asker.id, null, "Why?")
      .comment;

    const { notifications } = postToDiscussion(
      db,
      lessonId,
      asker.id,
      question.id,
      "Never mind, I worked it out."
    );

    expect(notifications).toEqual([]);
  });

  it("notifies nobody once the Discussion Question has been deleted", () => {
    const asker = addStudent("Ada");
    const replier = addStudent("Linus");
    const question = postToDiscussion(db, lessonId, asker.id, null, "Why?")
      .comment;
    deleteFromDiscussion(db, question.id, asker.id, false);

    const { notifications } = postToDiscussion(
      db,
      lessonId,
      replier.id,
      question.id,
      "Because of closures."
    );

    expect(notifications).toEqual([]);
  });
});

describe("editing", () => {
  it("notifies nobody when a Discussion Question is edited", () => {
    const asker = addStudent("Ada");
    const question = postToDiscussion(db, lessonId, asker.id, null, "Why?")
      .comment;

    const { comment, notifications } = editInDiscussion(
      db,
      question.id,
      asker.id,
      "Why does the counter keep its value?"
    );

    expect(comment.body).toBe("Why does the counter keep its value?");
    expect(notifications).toEqual([]);
  });

  it("notifies nobody when a Discussion Reply is edited", () => {
    const asker = addStudent("Ada");
    const replier = addStudent("Linus");
    const question = postToDiscussion(db, lessonId, asker.id, null, "Why?")
      .comment;
    const reply = postToDiscussion(
      db,
      lessonId,
      replier.id,
      question.id,
      "Closures."
    ).comment;

    const { notifications } = editInDiscussion(
      db,
      reply.id,
      replier.id,
      "Closures: the inner function keeps the variable alive."
    );

    expect(notifications).toEqual([]);
  });
});
