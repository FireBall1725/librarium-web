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
import SettingsIndexPage from './pages/settings/SettingsIndexPage'
import LicencesPage from './pages/settings/LicencesPage'
import AppearancePage from './pages/settings/AppearancePage'
import LegacySettingsRedirect from './pages/settings/LegacySettingsRedirect'
import AuthorsPage from './pages/AuthorsPage'
import LibrariesPage from './pages/libraries/LibrariesPage'
import LibraryPage from './pages/libraries/LibraryPage'
import BookPage from './pages/libraries/BookPage'
import ContributorsPage from './pages/libraries/ContributorsPage'
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
import MediaTypesPage from './pages/admin/settings/MediaTypesPage'
import ProfilesPage from './pages/admin/settings/ProfilesPage'
import GeneralPage from './pages/admin/settings/GeneralPage'
import ConnectionsLayout from './pages/admin/ConnectionsLayout'
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
                <Route path="/admin/connections" element={<ConnectionsLayout />}>
                  <Route index element={<Navigate to="ai" replace />} />
                  <Route path="ai" element={<AIPage />} />
                </Route>
                {/* Settings moved out from under /admin: most of these are
                    instance configuration rather than user administration, and
                    the split was the reason nobody could find anything. The old
                    paths redirect so existing links and bookmarks still land. */}
                <Route path="/settings" element={<SettingsLayout />}>
                  <Route index element={<SettingsIndexPage />} />
                  <Route path="metadata"          element={<MetadataPage />} />
                  <Route path="media-management"  element={<MediaManagementPage />} />
                  <Route path="tags"               element={<TagsPage />} />
                  <Route path="genres"             element={<GenresPage />} />
                  <Route path="media-types"       element={<MediaTypesPage />} />
                  <Route path="profiles"          element={<ProfilesPage />} />
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
                <Route path="/libraries/:libraryId" element={<Navigate to="books" replace />} />
                <Route path="/libraries/:libraryId/books" element={<LibraryPage section="books" />} />
                <Route path="/libraries/:libraryId/shelves" element={<LibraryPage section="shelves" />} />
                <Route path="/libraries/:libraryId/series" element={<LibraryPage section="series" />} />
                <Route path="/libraries/:libraryId/series/:seriesId" element={<LibraryPage section="series" />} />
                <Route path="/libraries/:libraryId/loans" element={<LibraryPage section="loans" />} />
                <Route path="/libraries/:libraryId/members" element={<LibraryPage section="members" />} />
                <Route path="/libraries/:libraryId/books/:bookId" element={<BookPage />} />
                <Route path="/libraries/:libraryId/contributors" element={<ContributorsPage />} />
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
