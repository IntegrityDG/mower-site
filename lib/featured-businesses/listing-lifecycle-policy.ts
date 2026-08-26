export type RenewalCandidate={businessId:string;businessName:string;expiresAt:string;contactEmail:string|null;reminder30SentAt:string|null;reminder7SentAt:string|null};
const DAY=86_400_000;
export function reminderKind(candidate:RenewalCandidate,now:Date):30|7|null{const remaining=new Date(candidate.expiresAt).getTime()-now.getTime();if(remaining<=0)return null;if(remaining<=7*DAY&&!candidate.reminder7SentAt)return 7;if(remaining<=30*DAY&&remaining>7*DAY&&!candidate.reminder30SentAt)return 30;return null}
