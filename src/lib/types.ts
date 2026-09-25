// Row shapes for NetFun tables used by the dashboard
// (core schema in the app repo + supabase/admin_tournaments.sql here).

export type Profile = {
  id: string;
  username: string;
  full_name: string;
  university: string;
  avatar_color: string;
  banned_at?: string | null;
  tournament_blocked_at?: string | null;
};

export type Community = { id: string; slug: string; name: string; is_official: boolean };

export type Post = {
  id: string;
  author_id: string;
  community_id: string | null;
  kind: "text" | "photo" | "poll" | "prompt";
  body: string;
  image_path: string | null;
  visibility: "everyone" | "connections";
  is_official: boolean;
  tournament_id: string | null;
  created_at: string;
  author: Profile | null;
  community: Pick<Community, "slug" | "name"> | null;
  like_count: number;
  comment_count: number;
};

export type TournamentStatus = "draft" | "open" | "closed" | "live" | "completed" | "cancelled";

export type Tournament = {
  id: string;
  title: string;
  game: string;
  description: string;
  criteria: string[];
  entry_question: string;
  format: string;
  prize: string;
  max_participants: number | null;
  starts_at: string | null;
  registration_closes_at: string | null;
  banner_path: string | null;
  status: TournamentStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TournamentWithCounts = Tournament & {
  pending: number;
  accepted: number;
  rejected: number;
};

export type EntryStatus = "pending" | "accepted" | "rejected";

export type TournamentEntry = {
  id: string;
  tournament_id: string;
  user_id: string;
  in_game_name: string;
  answer: string;
  status: EntryStatus;
  admin_note: string;
  created_at: string;
  reviewed_at: string | null;
  user: Profile | null;
};

export type AdminUser = {
  id: string;
  username: string;
  full_name: string;
  university: string;
  avatar_color: string;
  email: string;
  created_at: string;
  banned_at: string | null;
  ban_reason: string;
  tournament_blocked_at: string | null;
  is_admin: boolean;
  post_count: number;
};

export type AdminStats = {
  users: number;
  users_week: number;
  posts: number;
  posts_today: number;
  tournaments_open: number;
  pending_entries: number;
  banned: number;
};
