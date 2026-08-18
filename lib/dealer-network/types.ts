export const MEMBER_ROLES = ["dealer", "repair_tech", "both"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const APPLICATION_STATUSES = [
  "pending",
  "more_information_requested",
  "approved",
  "denied",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const MEMBER_STATUSES = [
  "pending_activation",
  "active",
  "suspended",
  "archived",
] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const BRAND_RELATIONSHIP_TYPES = ["sold", "serviced"] as const;
export type BrandRelationshipType = (typeof BRAND_RELATIONSHIP_TYPES)[number];
export type BrandApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "removed";
export type BrandStatus = "active" | "inactive" | "archived";
export type SuggestionStatus = "new" | "reviewed" | "resolved";
export type SuggestionCategory =
  | "new_brand"
  | "database_correction"
  | "member_information"
  | "search_improvement"
  | "portal_improvement"
  | "inaccurate_information"
  | "other";
export type BusinessType =
  | "robotic_mower_dealer"
  | "robotic_mower_repair"
  | "general_repair_shop"
  | "small_engine_repair_shop"
  | "other";
export type NotificationStatus = "pending" | "sent" | "failed";
export type NotificationEventType =
  | "ids_new_application"
  | "applicant_activation"
  | "applicant_denied"
  | "applicant_more_information"
  | "member_pin_reset"
  | "member_new_message"
  | "member_broadcast"
  | "member_invitation";

export type ReportStatus = "new" | "reviewed" | "resolved";
export type TroubleshootingStatus = "pending" | "approved" | "denied";
export type TroubleshootingPhotoKind = "issue" | "fix";

export type AccountState = {
  memberId: string;
  memberName: string;
  companyName: string;
  status: MemberStatus;
  accountLocked: boolean;
  messagingEnabled: boolean;
  effectiveLocked: boolean;
  expiresAt: string;
};

export type DealerBrand = {
  id: string;
  name: string;
  models: string[];
  status: BrandStatus;
  sortOrder: number;
};

export type CertificationInput = {
  certificationName: string;
  brandOrManufacturer: string;
  issuingOrganization: string;
  dateEarned: string | null;
  expirationDate: string | null;
};

export type DealerApplicationInput = {
  applicantName: string;
  companyName: string;
  phone: string;
  normalizedPhone: string;
  email: string;
  normalizedEmail: string;
  normalizedCompanyName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zipCode: string;
  websiteUrl: string | null;
  role: MemberRole;
  experience: string;
  serviceRegion: string;
  introduction: string;
  businessType: BusinessType;
  otherBusinessType: string | null;
  certificationAnswer: boolean | null;
  brandsSold: string[];
  brandsServiced: string[];
  certifications: CertificationInput[];
  consent: true;
};

export type MemberBrand = {
  id: string;
  brandId: string;
  brandName: string;
  relationshipType: BrandRelationshipType;
  approvalStatus: BrandApprovalStatus;
  requestedAt?: string;
};

export type MemberProfile = {
  id: string;
  memberName: string;
  companyName: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zipCode: string;
  websiteUrl: string | null;
  role: MemberRole;
  experience: string;
  serviceRegion: string;
  introduction: string;
  logoUrl: string | null;
  brands: MemberBrand[];
};

export type DirectoryFilters = {
  query?: string;
  role?: MemberRole;
  brandId?: string;
  relationshipType?: BrandRelationshipType;
  region?: string;
  zipCode?: string;
  areaCode?: string;
  near?: "business" | "coordinates" | "zip";
  latitude?: number;
  longitude?: number;
  nearZip?: string;
  radiusMiles?: 25 | 50 | 100 | 250;
};

export type DirectoryResult = {
  id: string;
  memberName: string;
  companyName: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  zipCode: string;
  websiteUrl: string | null;
  role: MemberRole;
  experience: string;
  serviceRegion: string;
  introduction: string;
  logoUrl: string | null;
  brandsSold: Array<{ id: string; name: string }>;
  brandsServiced: Array<{ id: string; name: string }>;
  distanceMiles: number | null;
  isFriend?: boolean;
  blockedByYou?: boolean;
};

export type FriendResult = DirectoryResult & {
  available: true;
  isFriend: true;
};

export type UnavailableFriendResult = {
  id: string;
  available: false;
  isFriend: true;
  displayName: "Member unavailable";
};

export type MemberBlock =
  | (DirectoryResult & { available: true; blockedByYou: true })
  | {
      id: string;
      available: false;
      displayName: "Member unavailable";
      blockedByYou: true;
    };

export type MessageAttachment = {
  id: string;
  url: string;
  width: number;
  height: number;
  position: number;
};

export type DealerMessage = {
  id: string;
  conversationId: string;
  sentByMe: boolean;
  body: string | null;
  attachments: MessageAttachment[];
  createdAt: string;
};

export type ConversationParticipant = {
  id: string;
  displayName: string;
  companyName: string | null;
  available: boolean;
  blockedByYou: boolean;
};

export type MessagingPermission = "send" | "read_only";

export type ConversationSummary = {
  id: string;
  participant: ConversationParticipant;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string;
};

export type ConversationDetail = {
  conversation: ConversationSummary;
  messages: DealerMessage[];
  canSend: boolean;
  messagingPermission: MessagingPermission;
  hasMore: boolean;
  nextBefore: string | null;
};

export type MessageUploadTicket = {
  id: string;
  path: string;
  signedUrl: string;
  token: string;
};

export type TroubleshootingPhoto = {
  id: string;
  photoKind: TroubleshootingPhotoKind;
  url: string;
  width: number;
  height: number;
  position: number;
};

export type TroubleshootingEntry = {
  id: string;
  memberId: string;
  memberName: string;
  companyName: string;
  title: string;
  brand: string;
  model: string;
  issueDate: string;
  firmwareSoftwareVersion: string;
  systemArea: string;
  badPart: string | null;
  issueDescription: string;
  fixDescription: string;
  status: TroubleshootingStatus;
  photos: TroubleshootingPhoto[];
  approvedAt: string | null;
  createdAt: string;
};

export type AdminTroubleshootingPhoto = TroubleshootingPhoto & {
  publiclyVisible: boolean;
};

export type AdminTroubleshootingEntry = Omit<TroubleshootingEntry, "photos"> & {
  publiclyPublished: boolean;
  photos: AdminTroubleshootingPhoto[];
};

export type TroubleshootingUploadTicket = MessageUploadTicket & {
  photoKind: TroubleshootingPhotoKind;
  position: number;
};

export type DealerReport = {
  id: string;
  reporterMemberId: string;
  reporterName: string;
  reportedMemberId: string;
  reportedName: string;
  conversationId: string;
  reason: string;
  status: ReportStatus;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  resolvedAt: string | null;
};

export const ROLE_LABELS: Record<MemberRole, string> = {
  dealer: "Dealer",
  repair_tech: "Repair Tech",
  both: "Both",
};
export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: "Pending",
  more_information_requested: "More Information Requested",
  approved: "Approved",
  denied: "Denied",
};
export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  pending_activation: "Pending Activation",
  active: "Active",
  suspended: "Suspended",
  archived: "Archived",
};
export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  robotic_mower_dealer: "Robotic Mower Dealer",
  robotic_mower_repair: "Robotic Mower Repair Business / Technician",
  general_repair_shop: "General Repair Shop",
  small_engine_repair_shop: "Small Engine Repair Shop",
  other: "Other Relevant Professional Business",
};

export const LOCKED_MEMBER_MESSAGE =
  "Please Contact IDS About Your Member Details";
