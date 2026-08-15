export type ConversationParticipants = {
  member_low_id: string;
  member_high_id: string;
};

export function conversationIncludesMember(
  conversation: ConversationParticipants,
  memberId: string,
) {
  return (
    conversation.member_low_id === memberId ||
    conversation.member_high_id === memberId
  );
}

export function otherConversationMember(
  conversation: ConversationParticipants,
  memberId: string,
) {
  if (!conversationIncludesMember(conversation, memberId)) return null;
  return conversation.member_low_id === memberId
    ? conversation.member_high_id
    : conversation.member_low_id;
}
