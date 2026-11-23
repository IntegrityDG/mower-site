export const BOARD_BRANCH_LIMIT = 5;
export const BOARD_REPLY_LIMIT = 5;
export const BOARD_COMMENT_LIMIT = 200;
export const BOARD_REPLY_TEXT_LIMIT = 150;
export const BOARD_COMMENT_IMAGE_LIMIT = 3;
export const BOARD_REPLY_IMAGE_LIMIT = 1;

export type BoardPhoto = { id: string; url: string; width: number; height: number };
export type BoardMemberComment = {
  id: string;
  parentCommentId: string | null;
  body: string;
  createdAt: string;
  edited: boolean;
  hidden: boolean;
  canEdit: boolean;
  author: { firstName: string; companyName: string; messageMemberId: string | null } | null;
  attachments: BoardPhoto[];
};
export type BoardMemberTopic = {
  id: string;
  title: string;
  status: "active" | "closed" | "archived";
  isRead: boolean;
  announcement: {body: string} | null;
  poll: {
    id: string; question: string; explanation: string; closes_at: string | null;
    effectiveOpen: boolean; allow_vote_change: boolean;
  } | null;
  discussion: {id: string; context: string; status: "open" | "closed"} | null;
  options: {id: string; label: string; voteCount: number}[];
  myVoteOptionId: string | null;
  responseCount: number;
  recipientCount: number;
  comments: BoardMemberComment[];
};
export type BoardFilter = "active" | "needs" | "archived";

export const boardTextCount = (text: string) => Array.from(text.trim()).length;

export function boardTextLimit(parentCommentId: string | null) {
  return parentCommentId ? BOARD_REPLY_TEXT_LIMIT : BOARD_COMMENT_LIMIT;
}

export function boardPhotoLimit(parentCommentId: string | null) {
  return parentCommentId ? BOARD_REPLY_IMAGE_LIMIT : BOARD_COMMENT_IMAGE_LIMIT;
}

export function boardTopicFilter(topic: Pick<BoardMemberTopic, "status">): BoardFilter {
  return topic.status === "archived" ? "archived" : "active";
}

export function filterBoardTopics(topics: BoardMemberTopic[], filter: BoardFilter, archiveSearch: string, focused: string | null) {
  const phrase = archiveSearch.trim().toLowerCase();
  return topics.filter(topic => {
    if (filter === "archived") return topic.status === "archived" && (!phrase ||
      `${topic.title} ${topic.announcement?.body ?? ""} ${topic.poll?.question ?? ""} ${topic.discussion?.context ?? ""}`.toLowerCase().includes(phrase));
    if (filter === "needs") return topic.status === "active" && topic.poll?.effectiveOpen && !topic.myVoteOptionId;
    return topic.status !== "archived";
  }).sort((a, b) => Number(b.id === focused) - Number(a.id === focused));
}

export function boardVisibleBranchCount(comments: BoardMemberComment[]) {
  const livingParents = new Set(comments.filter(comment => !comment.hidden && comment.parentCommentId).map(comment => comment.parentCommentId));
  return comments.filter(comment => !comment.parentCommentId && (!comment.hidden || livingParents.has(comment.id))).length;
}
