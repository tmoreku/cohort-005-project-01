import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { comments, courses, lessons, modules, users } from "~/db/schema";
import {
  MAX_COMMENT_LENGTH,
  MIN_COMMENT_LENGTH,
  discussionQuestionAnchor,
  discussionReplyAnchor,
} from "~/lib/comments";
import {
  sendNotification,
  type NotificationToSend,
  type RecipientUser,
} from "~/lib/notifier.server";

// ─── Discussions ───
// Posting, editing and deleting Discussion Questions and Discussion Replies
// under a lesson. Every top-level comment is a Discussion Question; a comment
// with a parent is a Discussion Reply. See GLOSSARY.md.
//
// Each function returns the Notifications to send; the route hands them to
// the notifier. Every function takes the database first, so tests can hand in
// an in-memory one. Validation failures throw an Error whose message is shown
// to the person.

export type Db = BetterSQLite3Database<typeof schema>;

type Comment = typeof comments.$inferSelect;

export type DiscussionChange = {
  comment: Comment;
  notifications: NotificationToSend[];
};

// ─── Targets ───

function lessonUrl(courseSlug: string, lessonId: number) {
  return `/courses/${courseSlug}/lessons/${lessonId}`;
}

// ─── Lookups ───

export function getDiscussionComment(db: Db, commentId: number) {
  return db.select().from(comments).where(eq(comments.id, commentId)).get();
}

function getLessonContext(db: Db, lessonId: number) {
  return db
    .select({
      lessonTitle: lessons.title,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      instructorId: courses.instructorId,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, lessonId))
    .get();
}

function getRecipient(db: Db, userId: number): RecipientUser | undefined {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      timezone: users.timezone,
      locale: users.locale,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get();
}

function getActor(db: Db, userId: number) {
  return db
    .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, userId))
    .get();
}

function assertValidBody(body: string) {
  const trimmed = body.trim();
  if (trimmed.length < MIN_COMMENT_LENGTH) {
    throw new Error("Comment cannot be empty");
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new Error(
      `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`
    );
  }
  return trimmed;
}

// ─── Posting ───

/**
 * Posts a Discussion Question (no parent) or a Discussion Reply (with the
 * Discussion Question as parent).
 *
 * A Discussion Question notifies the course's Instructor. A Discussion Reply
 * notifies only the Discussion Question's author, and nobody once that
 * Discussion Question has been deleted. The person posting is never notified.
 */
export function postToDiscussion(
  db: Db,
  lessonId: number,
  authorId: number,
  parentId: number | null,
  body: string
): DiscussionChange {
  const trimmed = assertValidBody(body);

  const lesson = getLessonContext(db, lessonId);
  if (!lesson) {
    throw new Error("Lesson not found");
  }

  const actor = getActor(db, authorId);
  if (!actor) {
    throw new Error("You must be logged in");
  }

  const question = parentId === null ? null : getDiscussionComment(db, parentId);
  if (parentId !== null) {
    if (!question) {
      throw new Error("Parent comment not found");
    }
    if (question.lessonId !== lessonId) {
      throw new Error("Parent comment belongs to a different lesson");
    }
    if (question.parentId !== null) {
      throw new Error("Replies can only be one level deep");
    }
  }

  const comment = db
    .insert(comments)
    .values({ userId: authorId, lessonId, parentId, body: trimmed })
    .returning()
    .get();

  const url = lessonUrl(lesson.courseSlug, lessonId);
  const titles = {
    courseTitle: lesson.courseTitle,
    lessonTitle: lesson.lessonTitle,
  };

  if (!question) {
    const instructor = getRecipient(db, lesson.instructorId);
    if (!instructor || instructor.id === authorId) {
      return { comment, notifications: [] };
    }
    return {
      comment,
      notifications: [
        {
          kind: "discussion-question-asked",
          recipients: [instructor],
          actor,
          url: `${url}#${discussionQuestionAnchor(comment.id)}`,
          data: {
            studentName: actor.name,
            ...titles,
            questionBody: comment.body,
          },
        },
      ],
    };
  }

  // A deleted Discussion Question has nobody left to tell.
  if (question.deletedAt !== null) return { comment, notifications: [] };

  const asker = getRecipient(db, question.userId);
  if (!asker || asker.id === authorId) return { comment, notifications: [] };

  return {
    comment,
    notifications: [
      {
        kind: "discussion-reply",
        recipients: [asker],
        actor,
        url: `${url}#${discussionReplyAnchor(comment.id)}`,
        data: {
          replierName: actor.name,
          ...titles,
          questionBody: question.body,
          replyBody: comment.body,
        },
      },
    ],
  };
}

/**
 * Hands posted Notifications to the notifier. The comment is already saved,
 * so a Notification that fails to send is logged rather than turned into an
 * error the person would retry (delivery isn't guaranteed; see spec #21).
 */
export async function sendDiscussionNotifications(
  notifications: NotificationToSend[]
): Promise<void> {
  for (const notification of notifications) {
    try {
      await sendNotification(notification);
    } catch (error) {
      console.error(`Could not send the ${notification.kind} Notification`, error);
    }
  }
}

// ─── Editing and deleting ───

/** Edits the author's own comment. Edits never notify anyone. */
export function editInDiscussion(
  db: Db,
  commentId: number,
  userId: number,
  body: string
): DiscussionChange {
  const trimmed = assertValidBody(body);

  const existing = getDiscussionComment(db, commentId);
  if (!existing) {
    throw new Error("Comment not found");
  }
  if (existing.deletedAt !== null) {
    throw new Error("Comment has been deleted");
  }
  if (existing.userId !== userId) {
    throw new Error("You can only edit your own comments");
  }

  const comment = db
    .update(comments)
    .set({ body: trimmed, editedAt: new Date().toISOString() })
    .where(eq(comments.id, commentId))
    .returning()
    .get();

  return { comment, notifications: [] };
}

/**
 * Soft-deletes a comment: its author's, or anyone's for staff. A deleted
 * Discussion Question keeps its Discussion Replies readable, but later
 * Discussion Replies to it notify nobody.
 */
export function deleteFromDiscussion(
  db: Db,
  commentId: number,
  userId: number,
  isStaff: boolean
): DiscussionChange {
  const existing = getDiscussionComment(db, commentId);
  if (!existing) {
    throw new Error("Comment not found");
  }
  if (existing.userId !== userId && !isStaff) {
    throw new Error("You can only delete your own comments");
  }
  if (existing.deletedAt !== null) {
    return { comment: existing, notifications: [] };
  }

  const comment = db
    .update(comments)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(comments.id, commentId))
    .returning()
    .get();

  return { comment, notifications: [] };
}
