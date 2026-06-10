export type Region = string;

export type CustomerPath =
  | "nationwide"
  | "local-services"
  | "recommendation";

export type PathContent = {
  eyebrow: string;
  title: string;
  description: string;
};

export type PathCard = {
  key: CustomerPath;
  badge: string;
  title: string;
  description: string;
};
