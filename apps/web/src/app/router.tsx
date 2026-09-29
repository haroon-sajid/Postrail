import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useMe } from '@/api/me';
import { AppShell } from './shell';
import { FullPageSkeleton } from './shell-skeleton';
import { ApiKeysPage } from '@/pages/api-keys/api-keys';
import { InvitePage } from '@/pages/auth/invite';
import { LoginPage } from '@/pages/auth/login';
import { LogsPage } from '@/pages/logs/logs';
import { MailboxesPage } from '@/pages/mailboxes/mailboxes';
import { NotFoundPage } from '@/pages/not-found';
import { OverviewPage } from '@/pages/overview/overview';
import { TemplateEditorPage } from '@/pages/templates/editor';
import { TemplatesPage } from '@/pages/templates/templates';

/** Sends signed-out visitors to /login, remembering where they were going. */
function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <FullPageSkeleton />;
  if (!me.data) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

/** `/` lands on the first org; a user with no org gets one created at sign-in. */
function Home() {
  const me = useMe();
  if (me.isPending) return <FullPageSkeleton />;
  const first = me.data?.orgs[0];
  return first ? <Navigate to={`/o/${first.id}`} replace /> : <Navigate to="/login" replace />;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/invite/:token', element: <InvitePage /> },
      {
        path: '/o/:orgId',
        element: <AppShell />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: 'logs', element: <LogsPage /> },
          { path: 'mailboxes', element: <MailboxesPage /> },
          { path: 'api-keys', element: <ApiKeysPage /> },
          { path: 'templates', element: <TemplatesPage /> },
          { path: 'templates/new', element: <TemplateEditorPage /> },
          { path: 'templates/:id', element: <TemplateEditorPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
