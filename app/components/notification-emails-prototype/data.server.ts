// PROTOTYPE (throwaway): Notification emails, wayfinder ticket #18.
// Pulls real seed names so the emails read like Cadence. Nothing is sent,
// nothing talks to Knock or Resend.
import { eq, isNull, isNotNull } from "drizzle-orm";
import { db } from "~/db";
import { users, courses, modules, lessons, comments, UserRole } from "~/db/schema";

export interface EmailSeed {
  admin: { name: string };
  buyer: { name: string; email: string };
  instructor: { name: string };
  student: { name: string; email: string };
  replier: { name: string };
  teamAdmin: { name: string };
  course: { title: string; slug: string; price: number };
  lesson: { id: number; title: string };
  question: string;
  reply: string;
}

const LONG_QUESTION = `I followed the steps in this lesson but my loader still runs on every navigation, even when I only change a search param. I tried adding \`shouldRevalidate\` and returning false, but then the data goes stale after I submit the form on the same page.

Is there a pattern for "revalidate after my own actions, but not when the search params change"? Or am I thinking about this the wrong way? I've pasted my route module below in case it helps:

\`\`\`ts
export function shouldRevalidate({ currentUrl, nextUrl }) {
  return currentUrl.pathname !== nextUrl.pathname;
}
\`\`\``;

export function getEmailSeed(): EmailSeed {
  const byRole = (role: UserRole) =>
    db.select().from(users).where(eq(users.role, role)).limit(6).all();
  const admins = byRole(UserRole.Admin);
  const instructors = byRole(UserRole.Instructor);
  const students = byRole(UserRole.Student);

  const course = db.select().from(courses).limit(1).get();
  const lesson = course
    ? db
        .select({ id: lessons.id, title: lessons.title })
        .from(lessons)
        .innerJoin(modules, eq(lessons.moduleId, modules.id))
        .where(eq(modules.courseId, course.id))
        .limit(1)
        .get()
    : undefined;

  // A real reply and the Discussion Question it answers, so the pair reads true.
  const reply = db
    .select({ body: comments.body, parentId: comments.parentId })
    .from(comments)
    .where(isNotNull(comments.parentId))
    .limit(1)
    .get();
  const topLevel = reply?.parentId
    ? db
        .select({ body: comments.body })
        .from(comments)
        .where(eq(comments.id, reply.parentId))
        .get()
    : db.select({ body: comments.body }).from(comments).where(isNull(comments.parentId)).limit(1).get();

  const s = (i: number) =>
    students[i % Math.max(students.length, 1)] ?? {
      name: "Sam Student",
      email: "sam@example.com",
    };

  return {
    admin: { name: admins[0]?.name ?? "Alex Admin" },
    buyer: { name: s(0).name, email: s(0).email },
    instructor: { name: instructors[0]?.name ?? "Ivy Instructor" },
    student: { name: s(1).name, email: s(1).email },
    replier: { name: instructors[0]?.name ?? s(2).name },
    teamAdmin: { name: s(3).name },
    course: {
      title: course?.title ?? "Full-Stack React Router",
      slug: course?.slug ?? "full-stack-react-router",
      price: course?.price || 14900,
    },
    lesson: lesson ?? { id: 1, title: "Loaders and revalidation" },
    question: topLevel?.body ?? LONG_QUESTION,
    reply:
      reply?.body ??
      "Good question! `shouldRevalidate` gets `formMethod` too: return `true` when it's set, and compare everything except the search params otherwise.",
  };
}
