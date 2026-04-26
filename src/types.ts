export interface User {
  id: string
  username: string
  email: string
  display_name: string
  is_instance_admin: boolean
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  expires_in: number
  user: User
}

export interface AdminUser extends User {
  is_active: boolean
  created_at: string
  last_login_at: string | null
}

export interface PagedUsers {
  items: AdminUser[]
  total: number
  page: number
  per_page: number
}

export interface MediaType {
  id: string
  name: string
  display_name: string
  description?: string
  book_count: number
}

export interface ContributorResult {
  id: string
  name: string
}

// MeSeriesResult — GET /api/v1/me/series, aggregated across the caller's libraries.
export interface MeSeriesResult {
  id: string
  name: string
  library_id: string
  library_name: string
}

// MeTagResult — GET /api/v1/me/tags. `ambiguous` is true when another
// accessible library has a tag with the same name; the UI appends the
// library name to disambiguate.
export interface MeTagResult {
  id: string
  name: string
  library_id: string
  library_name: string
  ambiguous: boolean
}

export interface BookContributor {
  contributor_id: string
  name: string
  role: string
  display_order: number
}

export interface Tag {
  id: string
  library_id: string
  name: string
  color: string
  created_at: string
}

export interface Genre {
  id: string
  name: string
  created_at: string
}

export interface Shelf {
  id: string
  library_id: string
  name: string
  description: string
  color: string
  icon: string
  display_order: number
  book_count: number
  tags: Tag[]
  created_at: string
  updated_at: string
}

export interface BookShelfRef {
  id: string
  name: string
}

export interface BookLibraryRef {
  id: string
  name: string
}

export interface Book {
  id: string
  // library_id is the first library holding this book (picked by the API
  // from the library_books junction). Null when the book is floating — i.e.
  // not in any library (e.g. a suggestion-only book). Prefer `libraries`
  // when you need the full set.
  library_id: string | null
  libraries?: BookLibraryRef[]
  title: string
  subtitle: string
  media_type_id: string
  media_type: string
  description: string
  created_at: string
  updated_at: string
  contributors: BookContributor[]
  tags: Tag[]
  genres: Genre[]
  cover_url: string | null
  series: BookSeriesRef[]
  shelves: BookShelfRef[]
  publisher: string
  publish_year: number | null
  language: string
  user_read_status?: string
}

export interface PagedBooks {
  items: Book[]
  total: number
  page: number
  per_page: number
}

export interface EditionFile {
  id: string
  edition_id: string
  file_format: string
  file_name: string
  file_path: string
  root_path: string
  storage_location_id: string | null
  file_size: number | null
  display_order: number
  created_at: string
}

export interface BookEdition {
  id: string
  book_id: string
  format: string
  language: string
  edition_name: string
  narrator: string
  narrator_contributor_id: string | null
  narrator_contributor_name: string
  publisher: string
  publish_date: string | null
  isbn_10: string
  isbn_13: string
  description: string
  duration_seconds: number | null
  page_count: number | null
  is_primary: boolean
  // copy_count and acquired_at used to live here; they're now per-library
  // (tracked in library_book_editions). Future work: per-library copy UI.
  created_at: string
  updated_at: string
  files: EditionFile[]
}

export interface BrowseEntry {
  name: string
  path: string
  is_dir: boolean
  size?: number
  ext?: string
  is_bookable?: boolean
}

export interface StorageLocation {
  id: string
  library_id: string
  name: string
  root_path: string
  media_format: string
  path_template: string
  created_at: string
  updated_at: string
}

export interface ScanResult {
  linked: Array<{ file_path: string; file_size: number; file_ext: string; edition_id: string; book_title: string; isbn: string }>
  unlinked: Array<{ file_path: string; file_size: number }>
  missing_files: Array<{ edition_id: string; book_title: string; format: string; isbn_13: string; isbn_10: string }>
}

export interface UserBookInteraction {
  id: string
  user_id: string
  book_edition_id: string
  read_status: string
  rating: number | null
  notes: string
  review: string
  date_started: string | null
  date_finished: string | null
  is_favorite: boolean
  reread_count: number
  created_at: string
  updated_at: string
}

export interface Library {
  id: string
  name: string
  description: string
  slug: string
  owner_id: string
  is_public: boolean
  created_at: string
  updated_at: string
}

export interface Series {
  id: string
  library_id: string
  name: string
  description: string
  total_count: number | null
  is_complete: boolean // backward compat: API returns status === 'completed'
  status: string
  original_language: string
  publication_year: number | null
  demographic: string
  genres: string[]
  url: string
  external_id: string
  external_source: string
  last_release_date: string | null
  next_release_date: string | null
  book_count: number
  arc_count: number
  // Caller-relative reading state — number of books in the series whose
  // effective user_read_status is 'read' / 'reading'. Both 0 when not authed
  // or no progress recorded. UI gates display behind show_read_badges.
  read_count: number
  reading_count: number
  preview_books: SeriesPreviewBook[]
  tags: Tag[]
  created_at: string
  updated_at: string
}

export interface SeriesPreviewBook {
  book_id: string
  title: string
  cover_url: string | null
}

export interface SeriesArc {
  id: string
  series_id: string
  name: string
  description: string
  position: number
  book_count: number
  created_at: string
  updated_at: string
}

export interface SeriesVolume {
  id: string
  series_id: string
  position: number
  title: string
  release_date: string | null
  cover_url: string
  external_id: string
  created_at: string
  updated_at: string
}

export interface SeriesEntry {
  position: number
  book_id: string
  arc_id: string | null
  title: string
  subtitle: string
  media_type: string
  cover_url: string | null
  user_read_status: string
  contributors: BookContributor[]
}

export interface SeriesMatchCandidate {
  book_id: string
  title: string
  subtitle: string
  position: number
  other_series: BookSeriesRef[]
}

export interface SeriesSuggestionBook {
  book_id: string
  title: string
  subtitle: string
  position: number
  cover_url: string | null
}

export interface SeriesSuggestion {
  proposed_name: string
  books: SeriesSuggestionBook[]
}

export interface Loan {
  id: string
  library_id: string
  book_id: string
  book_title: string
  loaned_to: string
  loaned_at: string
  due_date: string | null
  returned_at: string | null
  notes: string
  tags: Tag[]
  created_at: string
  updated_at: string
}

export interface BookSeriesRef {
  series_id: string
  series_name: string
  position: number
}

export interface MergedFieldOption {
  value: string
  source: string
  source_display: string
}

export interface MergedFieldResult {
  value: string
  source: string
  source_display: string
  alternatives: MergedFieldOption[]
}

export interface CoverOption {
  source: string
  source_display: string
  cover_url: string
}

export interface MergedBookResult {
  title?: MergedFieldResult
  subtitle?: MergedFieldResult
  authors?: MergedFieldResult
  description?: MergedFieldResult
  publisher?: MergedFieldResult
  publish_date?: MergedFieldResult
  language?: MergedFieldResult
  isbn_10?: MergedFieldResult
  isbn_13?: MergedFieldResult
  page_count?: MergedFieldResult
  categories?: string[]
  covers?: CoverOption[]
}

export interface ISBNLookupResult {
  provider: string
  provider_display: string
  title: string
  subtitle: string
  authors: string[]
  publisher: string
  publish_date: string
  isbn_10: string
  isbn_13: string
  description: string
  cover_url: string
  language: string
  page_count: number | null
  categories?: string[]
}

export interface ProviderStatus {
  name: string
  display_name: string
  description: string
  requires_key: boolean
  capabilities: string[]
  help_text?: string
  help_url?: string
  enabled: boolean
  has_api_key: boolean
  config?: Record<string, string>
}

export interface SeriesLookupResult {
  provider: string
  provider_display: string
  name: string
  description: string
  total_count: number | null
  is_complete: boolean
  cover_url: string
  external_id: string
  status: string
  original_language: string
  publication_year: number | null
  demographic: string
  genres: string[]
  url: string
  external_source: string
}

export interface LibraryContributor {
  id: string
  name: string
  sort_name: string
  is_corporate: boolean
  photo_url: string | null
  book_count: number
  nationality: string
  born_date: string | null
  updated_at: string
}

export interface PagedContributors {
  items: LibraryContributor[]
  total: number
  page: number
  per_page: number
}

export interface ContributorWork {
  id: string
  contributor_id: string
  title: string
  isbn_13: string
  isbn_10: string
  publish_year: number | null
  cover_url: string
  source: string
  created_at: string
  in_library: boolean
  library_book_id: string | null
}

export interface ContributorDetail {
  id: string
  name: string
  sort_name: string
  is_corporate: boolean
  bio: string
  born_date: string | null
  died_date: string | null
  nationality: string
  external_ids: Record<string, string>
  photo_url: string | null
  book_count: number
  created_at: string
  updated_at: string
  works: ContributorWork[]
  books: Book[]
}

export interface DashboardBook {
  book_id: string
  library_id: string
  library_name: string
  title: string
  cover_url: string | null
  authors: string
  read_status: string
  updated_at?: string
}

// Kept for backwards compat — same shape
export type CurrentlyReadingBook = DashboardBook

export interface FinishedBook {
  book_id: string
  library_id: string
  library_name: string
  title: string
  authors: string
  cover_url: string | null
  finished_at: string
  rating: number | null
  is_favorite: boolean
}

export interface ContinueSeriesItem {
  series_id: string
  series_name: string
  position: number
  last_read_position: number
  book_id: string
  library_id: string
  library_name: string
  title: string
  authors: string
  cover_url: string | null
  read_status: string
}

export interface MonthlyReadBucket {
  month: string // "YYYY-MM"
  count: number
}

export interface DashboardStats {
  total_books: number
  books_read: number
  books_reading: number
  books_added_this_year: number
  books_read_this_year: number
  favorites_count: number
  monthly_reads: MonthlyReadBucket[]
}

export interface ExternalContributorCandidate {
  provider: string
  external_id: string
  name: string
  photo_url: string
}

export interface ExternalContributorData {
  provider: string
  external_id: string
  name: string
  bio: string
  born_date: string | null
  died_date: string | null
  nationality: string
  photo_url: string
  works: Array<{
    title: string
    isbn_13: string
    isbn_10: string
    publish_year: number | null
    cover_url: string
  }>
}

export interface LibraryMember {
  user_id: string
  username: string
  display_name: string
  email: string
  role_id: string
  role: string
  joined_at: string
  invited_by?: string
  tags: Tag[]
}

// ─── AI ──────────────────────────────────────────────────────────────────────

export interface AIConfigField {
  key: string
  label: string
  type: string // "password" | "text" | "url" | "model"
  required: boolean
  placeholder?: string
  help_text?: string
  options?: string[]
}

export interface AIProviderStatus {
  name: string
  display_name: string
  description: string
  help_text?: string
  help_url?: string
  config_fields: AIConfigField[]
  enabled: boolean
  active: boolean
  has_api_key: boolean
  config?: Record<string, string>
}

export interface AIPermissions {
  reading_history: boolean
  ratings: boolean
  favourites: boolean
  full_library: boolean
  taste_profile: boolean
}

export interface UserAIPrefs {
  opt_in: boolean
}

export interface SuggestionView {
  id: string
  type: string // "buy" | "read_next"
  book_id?: string
  book_edition_id?: string
  library_id?: string
  title: string
  author?: string
  isbn?: string
  cover_url?: string
  reasoning?: string
  status: string // "new" | "dismissed" | "interested" | "added_to_library"
  created_at: string
}

export interface SuggestionRunView {
  id: string
  user_id?: string // only set on admin-scoped responses
  triggered_by: string // scheduler | admin | user
  provider_type: string
  model_id?: string
  status: string // running | completed | failed
  error?: string
  tokens_in: number
  tokens_out: number
  estimated_cost_usd: number
  started_at: string
  finished_at?: string
  suggestion_count?: number
  steering?: SuggestionSteeringView | null
}

// Steering payload sent with POST /me/suggestions/run. All fields optional;
// at least one must be non-empty for the server to accept it.
export interface SuggestionSteeringInput {
  author_ids?: string[]
  series_ids?: string[]
  genre_ids?: string[]
  tag_ids?: string[]
  notes?: string
}

// SuggestionSteeringView is the hydrated form returned on run reads: IDs
// resolved to display names so the banner can render without extra fetches.
export interface SuggestionSteeringView {
  authors?: Array<{ id: string; name: string }>
  series?: Array<{ id: string; name: string }>
  genres?: Array<{ id: string; name: string }>
  tags?: Array<{ id: string; name: string; library_id: string }>
  notes?: string
}

// SuggestionRunEvent is one observable step in a pipeline run. `content`
// shape depends on `type`; the UI renders raw JSON for unknown types.
export interface SuggestionRunEvent {
  seq: number
  type: string
  content: Record<string, unknown>
  created_at: string
}

export interface SuggestionRunDetail {
  run: SuggestionRunView
  events: SuggestionRunEvent[]
}

export interface JobSummary {
  id: string
  display_name: string
  description: string
  kind: string
  enabled: boolean
}

// QuotaView is returned by GET /me/suggestions/quota. `available === false`
// gates Run Now + sidebar visibility; `unavailable_reason` is one of
// `job_disabled` / `no_provider` / `not_opted_in` when unavailable.
export interface SuggestionQuotaView {
  used: number
  limit: number
  resets_at?: string
  unlimited: boolean
  available: boolean
  unavailable_reason: string | null
}

export interface AISuggestionsJobConfig {
  enabled: boolean
  interval_minutes: number
  max_buy_per_user: number
  max_read_next_per_user: number
  include_taste_profile: boolean
  user_run_rate_limit_per_day: number
  max_tokens_initial: number
  max_tokens_backfill: number
}

// TasteProfile is the JSON shape stored per-user. All fields optional —
// empty categories simply aren't sent to the AI. Chip-style categories
// (genres, themes, formats) use `love` / `avoid` lists rather than per-item
// maps so the model prompt is compact and human-readable.
export interface TasteProfile {
  genres?: { love?: string[]; avoid?: string[]; favourite?: string[] }
  themes?: { love?: string[]; avoid?: string[] }
  formats?: { love?: string[]; avoid?: string[] }
  era?: string
  favourite_authors?: string[]
  hard_nos?: string
}
