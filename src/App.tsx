import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { ToastProvider } from './components/Toast'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import LibraryOutlet from './components/LibraryOutlet'
import LoginPage from './pages/LoginPage'
import SetupPage from './pages/SetupPage'
import ApiUnavailablePage from './pages/ApiUnavailablePage'
import DashboardPage from './pages/DashboardPage'
import BooksPage from './pages/BooksPage'
import SeriesPage from './pages/SeriesPage'
import LoansPage from './pages/LoansPage'
import SettingsIndexPage from './pages/settings/SettingsIndexPage'
import LicencesPage from './pages/settings/LicencesPage'
import ListsPage from './pages/settings/ListsPage'
import ShelvesPage from './pages/settings/ShelvesPage'
import MembersPage from './pages/settings/MembersPage'
import AppearancePage from './pages/settings/AppearancePage'
import LegacySettingsRedirect from './pages/settings/LegacySettingsRedirect'
import AuthorsPage from './pages/AuthorsPage'
import LibrariesPage from './pages/libraries/LibrariesPage'
import LibraryPage from './pages/libraries/LibraryPage'
import BookPage from './pages/libraries/BookPage'
import LegacyLibraryRedirect from './pages/libraries/LegacyLibraryRedirect'
import ContributorPage from './pages/libraries/ContributorPage'
import ImportPage from './pages/import/ImportPage'
import UsersPage from './pages/admin/UsersPage'
import JobsPage from './pages/jobs/JobsPage'
import JobKindPage from './pages/jobs/JobKindPage'
import JobsHistoryPage from './pages/jobs/JobsHistoryPage'
import SettingsLayout from './pages/admin/SettingsLayout'
import MetadataPage from './pages/admin/settings/MetadataPage'
import MediaManagementPage from './pages/admin/settings/MediaManagementPage'
import TagsPage from './pages/admin/settings/TagsPage'
import GenresPage from './pages/admin/settings/GenresPage'
import DuplicateAuthorsPage from './pages/settings/DuplicateAuthorsPage'
import MediaTypesPage from './pages/admin/settings/MediaTypesPage'
import ProfilesPage from './pages/admin/settings/ProfilesPage'
import GeneralPage from './pages/admin/settings/GeneralPage'
import AIPage from './pages/admin/connections/AIPage'
import { AiPrivacyPage, ApiTokensPage, ProfilePage } from './pages/settings/AccountPages'
import SuggestionsPage from './pages/SuggestionsPage'
import BookDetailPage from './pages/BookDetailPage'

function AppRoutes() {
  const { apiReachable } = useAuth()
  if (apiReachable === false) return <ApiUnavailablePage />
  return (
    <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            {/* Global layout — dashboard, library list, tools, admin */}
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/books" element={<BooksPage />} />
              <Route path="/series" element={<SeriesPage />} />
              <Route path="/authors" element={<AuthorsPage />} />
              <Route path="/loans" element={<LoansPage />} />
              <Route path="/libraries" element={<LibrariesPage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/profile" element={<SettingsLayout />}>
                <Route index element={<ProfilePage />} />
              </Route>
              <Route path="/suggestions" element={<SuggestionsPage />} />
              <Route path="/books/:bookId" element={<BookDetailPage />} />

              {/* Outside the admin guard, and declared before it so the static
                  path outranks the nested one. The footer offers Licences to
                  everyone, and required notices are not an admin feature. */}
              <Route path="/settings/licences" element={<SettingsLayout />}>
                <Route index element={<LicencesPage />} />
              </Route>
              <Route path="/settings/appearance" element={<SettingsLayout />}>
                <Route index element={<AppearancePage />} />
              </Route>
              <Route path="/settings/tokens" element={<SettingsLayout />}>
                <Route index element={<ApiTokensPage />} />
              </Route>
              <Route path="/settings/ai-privacy" element={<SettingsLayout />}>
                <Route index element={<AiPrivacyPage />} />
              </Route>

              <Route element={<ProtectedRoute requireAdmin />}>
                <Route path="/admin/users" element={<UsersPage />} />
                {/* Connections was a shell whose only child was AI, and whose
                    index redirected there. Both settings rows that pointed at
                    it therefore opened the same page. */}
                <Route path="/admin/connections" element={<Navigate to="/settings/ai" replace />} />
                <Route path="/admin/connections/ai" element={<Navigate to="/settings/ai" replace />} />
                {/* Settings moved out from under /admin: most of these are
                    instance configuration rather than user administration, and
                    the split was the reason nobody could find anything. The old
                    paths redirect so existing links and bookmarks still land. */}
                <Route path="/settings" element={<SettingsLayout />}>
                  <Route index element={<SettingsIndexPage />} />
                  <Route path="metadata"          element={<MetadataPage />} />
                  <Route path="ai"                element={<AIPage />} />
                  <Route path="media-management"  element={<MediaManagementPage />} />
                  <Route path="tags"               element={<TagsPage />} />
                  <Route path="genres"             element={<GenresPage />} />
                  <Route path="duplicate-authors"  element={<DuplicateAuthorsPage />} />
                  <Route path="media-types"       element={<MediaTypesPage />} />
                  <Route path="profiles"          element={<ProfilesPage />} />
                  <Route path="lists"             element={<ListsPage />} />
                  <Route path="shelves"           element={<ShelvesPage />} />
                  <Route path="members"           element={<MembersPage />} />
                  <Route path="general"           element={<GeneralPage />} />
                  <Route path="jobs"              element={<JobsPage />} />
                  <Route path="jobs/history"       element={<JobsHistoryPage />} />
                  <Route path="jobs/:kind"         element={<JobKindPage />} />
                </Route>
                <Route path="/admin/settings" element={<Navigate to="/settings" replace />} />
                <Route path="/admin/settings/*" element={<LegacySettingsRedirect />} />
              </Route>

              {/* Library section: shared sidebar, plus library-scoped breadcrumb/tabs */}
              <Route element={<LibraryOutlet />}>
                {/* Books and Contributors are retired: /books and /authors do
                    the same job with facets and saved views on top. Both keep
                    working as redirects so existing bookmarks land somewhere
                    sensible instead of on the dashboard. */}
                <Route path="/libraries/:libraryId" element={<LegacyLibraryRedirect to="/books" />} />
                <Route path="/libraries/:libraryId/books" element={<LegacyLibraryRedirect to="/books" />} />
                {/* Shelves became views, which live in the rail rather than
                    on a page of their own, so the old per-library URL lands on
                    Books with the rail beside it. */}
                <Route path="/libraries/:libraryId/shelves" element={<LegacyLibraryRedirect to="/books" />} />
                {/* The list is retired; /series does the same job across every
                    library, with filters, a sort and a create button the old
                    section never had. The detail view is still the only place
                    arcs, volume sync and the metadata merge live, so it stays
                    on its own URL until that moves too. */}
                <Route path="/libraries/:libraryId/series" element={<LegacyLibraryRedirect to="/series" />} />
                <Route path="/libraries/:libraryId/series/:seriesId" element={<LibraryPage section="series" />} />
                <Route path="/libraries/:libraryId/loans" element={<LegacyLibraryRedirect to="/loans" />} />
                <Route path="/libraries/:libraryId/members" element={<LegacyLibraryRedirect to="/settings/members" />} />
                <Route path="/libraries/:libraryId/books/:bookId" element={<BookPage />} />
                <Route path="/libraries/:libraryId/contributors" element={<LegacyLibraryRedirect to="/authors" />} />
                <Route path="/libraries/:libraryId/contributors/:contributorId" element={<ContributorPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
