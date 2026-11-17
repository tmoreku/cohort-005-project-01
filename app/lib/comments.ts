export const MIN_COMMENT_LENGTH = 1;
export const MAX_COMMENT_LENGTH = 5000;

// ─── Discussion anchors ───
// Stable element ids on the lesson page, which Notifications link to
// (`/courses/<slug>/lessons/<id>#discussion-question-12`). Every top-level
// comment is a Discussion Question; a comment with a parent is a Discussion
// Reply.

export function discussionQuestionAnchor(commentId: number) {
  return `discussion-question-${commentId}`;
}

export function discussionReplyAnchor(commentId: number) {
  return `discussion-reply-${commentId}`;
}

export type DiscussionTarget = {
  kind: "question" | "reply";
  commentId: number;
};

/** Reads a Discussion anchor back out of a URL fragment, with or without `#`. */
export function parseDiscussionTarget(hash: string): DiscussionTarget | null {
  const match = /^#?discussion-(question|reply)-(\d+)$/.exec(hash);
  if (!match) return null;
  return {
    kind: match[1] === "question" ? "question" : "reply",
    commentId: Number(match[2]),
  };
}
