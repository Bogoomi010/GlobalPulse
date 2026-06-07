export const forbiddenPublicPhrases = [
  '결제 기능은 제거되었습니다',
  '별도 충전',
  'Operations and refund policy',
  'Payments are disabled',
  'wallet top-ups',
  'paid comments',
  'checkout',
  'Stripe',
  'Toss',
  'refunds for paid balances',
];

export const requiredPublicPolicyPhrases = [
  {
    label: 'signed-in free comment access',
    phrases: ['Login to write a comment', '로그인 사용자는 무료로 댓글을 작성할 수 있습니다', '댓글 작성은 무료입니다'],
  },
  {
    label: 'comment authority disclaimer',
    phrases: ['댓글은 사실성이나 신뢰도를 의미하지 않습니다', '댓글 내용은 사실성이나 신뢰도를 보증하지 않습니다'],
  },
  {
    label: 'moderation and report handling',
    phrases: ['신고와 운영 검토', '댓글은 운영 검토 대상이 될 수 있으며', '숨김, 복원, 기각 처리될 수 있습니다'],
  },
  {
    label: 'neutral issue framing',
    phrases: ['정답을 단정하지 않고', '정답, 사실 확정, 진실 판정을 제공하지 않습니다'],
  },
];
