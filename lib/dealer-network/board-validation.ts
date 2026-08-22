export type BoardTopicInput = {
  title: string;
  announcementBody: string | null;
  poll: BoardPollInput | null;
  discussionContext: string | null;
  activate: boolean;
  sourceSuggestionId: string | null;
};
export type BoardPollInput = { question: string; explanation: string; options: string[]; allowVoteChange: boolean; closesAt: string | null };

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max + 1) : "";
export function validateBoardTopic(input: unknown): BoardTopicInput | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const body = input as Record<string, unknown>;
  const title = clean(body.title, 180);
  const announcementBody = clean(body.announcementBody, 5000) || null;
  const question = clean(body.pollQuestion, 500);
  const explanation = clean(body.pollExplanation, 5000);
  const rawOptions = Array.isArray(body.pollOptions) ? body.pollOptions : [];
  const options = rawOptions.map((option) => clean(option, 200)).filter(Boolean);
  const discussionContext = clean(body.discussionContext, 5000) || null;
  const closesAt = parseClosingTime(body.closesAt);
  if (!title || title.length > 180 || announcementBody?.length === 5001 || question.length > 500 || explanation.length > 5000) return null;
  if (question && (options.length < 2 || options.length > 10 || options.some((option) => option.length > 200) || closesAt === "INVALID")) return null;
  if (!announcementBody && !question && !discussionContext) return null;
  return {
    title, announcementBody,
    poll: question ? { question, explanation, options, allowVoteChange: body.allowVoteChange === true, closesAt } : null,
    discussionContext,
    activate: body.activate === true,
    sourceSuggestionId: typeof body.sourceSuggestionId === "string" ? body.sourceSuggestionId : null,
  };
}

function parseClosingTime(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return "INVALID";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.getTime() <= Date.now() ? "INVALID" : date.toISOString();
}

export function validateBoardPoll(input: unknown): BoardPollInput | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const body = input as Record<string, unknown>;
  const question = clean(body.question, 500), explanation = clean(body.explanation, 5000);
  const options = Array.isArray(body.options) ? body.options.map((option) => clean(option, 200)) : [];
  const closesAt = parseClosingTime(body.closesAt);
  if (!question || question.length > 500 || explanation.length > 5000 || options.length < 2 || options.length > 10 || options.some((option) => !option || option.length > 200) || closesAt === "INVALID") return null;
  return { question, explanation, options, allowVoteChange: body.allowVoteChange === true, closesAt };
}

export function validateCommentBody(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const body = clean((input as Record<string, unknown>).body, 5000);
  return body && body.length <= 5000 ? body : null;
}
