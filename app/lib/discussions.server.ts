import { eq } from "drizzle-orm";
import type { Db } from "~/db";
import { comments, courses, lessons, modules } from "~/db/schema";
import {
  MAX_COMMENT_LENGTH,
  MIN_COMMENT_LENGTH,
  discussionQuestionAnchor,
  discussionReplyAnchor,
} from "~/lib/comments";
import type { NotificationToSend } from "~/lib/notifier.server";
import { getUser, toActor, toRecipient } from "~/lib/notification-people.server";

// ─── Discussions ───
// Posting, editing and deleting Discussion Questions and Discussion Replies
// under a lesson. Every top-level comment is a Discussion Question; a comment
// with a parent is a Discussion Reply. See GLOSSARY.md.
//
// Posting returns the Notifications to send; the route hands them to
// sendNotifications. Every function takes the database first, so tests can hand in
// an in-memory one. Validation failures throw an Error whose message is shown
// to the person.

// A row of `comments`: a Discussion Question, or a Discussion Reply when it
// has a parent.
type QuestionOrReply = typeof comments.$inferSelect;

export type DiscussionPosting = {
  comment: QuestionOrReply;
  notifications: NotificationToSend[];
};

// ─── Targets ───

function lessonUrl(courseSlug: string, lessonId: number) {
  return `/courses/${courseSlug}/lessons/${lessonId}`;
}

// ─── Lookups ───

export function getQuestionOrReply(
  db: Db,
  id: number
): QuestionOrReply | undefined {
  return db.select().from(comments).where(eq(comments.id, id)).get();
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

function assertValidBody(body: string) {
  const trimmed = body.trim();
  if (trimmed.length < MIN_COMMENT_LENGTH) {
    throw new Error("Write something before posting.");
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new Error(`Keep it to ${MAX_COMMENT_LENGTH} characters or fewer.`);
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
): DiscussionPosting {
  const trimmed = assertValidBody(body);

  const lesson = getLessonContext(db, lessonId);
  if (!lesson) {
    throw new Error("Lesson not found");
  }

  const author = getUser(db, authorId);
  if (!author) {
    throw new Error("You must be logged in");
  }
  const actor = toActor(author);

  const question = parentId === null ? null : getQuestionOrReply(db, parentId);
  if (parentId !== null) {
    if (!question) {
      throw new Error("That question wasn't found.");
    }
    if (question.lessonId !== lessonId) {
      throw new Error("That question is on a different lesson.");
    }
    if (question.parentId !== null) {
      throw new Error("You can only reply to a question, not to a reply.");
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
    const instructor = getUser(db, lesson.instructorId);
    if (!instructor || instructor.id === authorId) {
      return { comment, notifications: [] };
    }
    return {
      comment,
      notifications: [
        {
          kind: "discussion-question-asked",
          recipients: [toRecipient(instructor)],
          actor,
          url: `${url}#${discussionQuestionAnchor(comment.id)}`,
          data: {
            studentName: actor.name,
            ...titles,
            questionBody: comment.body,
            askedAt: comment.createdAt,
          },
        },
      ],
    };
  }

  // A deleted Discussion Question has nobody left to tell.
  if (question.deletedAt !== null) return { comment, notifications: [] };

  const asker = getUser(db, question.userId);
  if (!asker || asker.id === authorId) return { comment, notifications: [] };

  return {
    comment,
    notifications: [
      {
        kind: "discussion-reply",
        recipients: [toRecipient(asker)],
        actor,
        url: `${url}#${discussionReplyAnchor(comment.id)}`,
        data: {
          replierName: actor.name,
          ...titles,
          questionBody: question.body,
          replyBody: comment.body,
          repliedAt: comment.createdAt,
        },
      },
    ],
  };
}

// ─── Editing and deleting ───

/**
 * Edits the author's own Discussion Question or Discussion Reply. Edits never
 * notify anyone.
 */
export function editInDiscussion(
  db: Db,
  commentId: number,
  userId: number,
  body: string
): QuestionOrReply {
  const trimmed = assertValidBody(body);

  const existing = getQuestionOrReply(db, commentId);
  if (!existing) {
    throw new Error("That question or reply wasn't found.");
  }
  if (existing.deletedAt !== null) {
    throw new Error("That question or reply has been deleted.");
  }
  if (existing.userId !== userId) {
    throw new Error("You can only edit your own questions and replies.");
  }

  return db
    .update(comments)
    .set({ body: trimmed, editedAt: new Date().toISOString() })
    .where(eq(comments.id, commentId))
    .returning()
    .get();
}

/**
 * Soft-deletes a Discussion Question or Discussion Reply: its author's, or
 * anyone's for staff. A deleted Discussion Question keeps its Discussion
 * Replies readable, but later Discussion Replies to it notify nobody.
 */
export function deleteFromDiscussion(
  db: Db,
  commentId: number,
  userId: number,
  isStaff: boolean
): QuestionOrReply {
  const existing = getQuestionOrReply(db, commentId);
  if (!existing) {
    throw new Error("That question or reply wasn't found.");
  }
  if (existing.userId !== userId && !isStaff) {
    throw new Error("You can only delete your own questions and replies.");
  }
  if (existing.deletedAt !== null) return existing;

  return db
    .update(comments)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(comments.id, commentId))
    .returning()
    .get();
}
