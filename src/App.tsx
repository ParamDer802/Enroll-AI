import { useEffect, useState, Component, type ReactNode, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  Camera,
  History,
  Download,
  Settings,
  ShieldCheck,
  ScanFace,
  Menu,
  X,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  WifiOff,
  Monitor,
  ArrowDownToLine,
} from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import type { AppSettings } from './types';
import { getSettings } from './database/db';
import { installAimlRoster } from './database/starterRoster';
import { DashboardPage } from './pages/DashboardPage';
import { StudentsPage } from './pages/StudentsPage';
import { SessionsPage } from './pages/SessionsPage';
import { SettingsPage } from './pages/SettingsPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { ImportModal } from './components/ImportModal';
import { CreateSessionModal } from './components/CreateSessionModal';
import { ToastContext, Button } from './components/ui';
const CapturePage = lazy(() =>
  import('./pages/CapturePage').then((m) => ({ default: m.CapturePage })),
);
const HistoryPage = lazy(() =>
  import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage })),
);
const ExportPage = lazy(() =>
  import('./pages/ExportPage').then((m) => ({ default: m.ExportPage })),
);
const navigation = [
  { id: 'dashboard', name: 'Overview', icon: LayoutDashboard },
  { id: 'students', name: 'Students', icon: Users },
  { id: 'sessions', name: 'Capture sessions', icon: Camera },
  { id: 'history', name: 'Capture history', icon: History },
  { id: 'exports', name: 'Exports', icon: Download },
];
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
function initialPage() {
  const value = location.hash.slice(1);
  return [
    'dashboard',
    'students',
    'sessions',
    'history',
    'exports',
    'settings',
    'privacy',
  ].includes(value)
    ? value
    : 'dashboard';
}
export default function App() {
  const [page, setPage] = useState(initialPage),
    [settings, setSettings] = useState<AppSettings | null>(null),
    [importOpen, setImportOpen] = useState(false),
    [createOpen, setCreateOpen] = useState(false),
    [mobile, setMobile] = useState(false),
    [capture, setCapture] = useState<{ sessionId: string; studentId?: string } | null>(null),
    [toast, setToast] = useState<{ text: string; error: boolean } | null>(null),
    [online, setOnline] = useState(navigator.onLine),
    [install, setInstall] = useState<InstallPrompt | null>(null),
    [startupError, setStartupError] = useState('');
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error('Offline registration failed', error);
    },
  });
  useEffect(() => {
    installAimlRoster()
      .then(getSettings)
      .then(setSettings)
      .catch((e) => setStartupError(`Local storage could not be opened: ${e.message}`));
    const connection = () => setOnline(navigator.onLine),
      prompt = (e: Event) => {
        e.preventDefault();
        setInstall(e as InstallPrompt);
      };
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    window.addEventListener('beforeinstallprompt', prompt);
    return () => {
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
      window.removeEventListener('beforeinstallprompt', prompt);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const hash = () => {
      if (!capture) setPage(initialPage());
    };
    window.addEventListener('hashchange', hash);
    return () => window.removeEventListener('hashchange', hash);
  }, [capture]);
  function navigate(next: string) {
    if (capture) return;
    setPage(next);
    location.hash = next;
    setMobile(false);
  }
  function start(sessionId: string, studentId?: string) {
    setCapture({ sessionId, studentId });
    setMobile(false);
  }
  async function exitCapture() {
    try {
      // Capture can save a new device selection without recreating its controller.
      setSettings(await getSettings());
    } catch {
      setToast({
        text: 'Could not reload camera preferences. Reload the app before your next session.',
        error: true,
      });
    }
    setCapture(null);
    setPage('sessions');
    location.hash = 'sessions';
  }
  if (startupError)
    return (
      <div className="fatal">
        <AlertCircle size={36} />
        <h1>We couldn’t open local storage</h1>
        <p>{startupError}</p>
        <p>Allow site storage or open this app in a regular browser window.</p>
        <Button onClick={() => location.reload()}>Retry</Button>
      </div>
    );
  return (
    <ToastContext.Provider value={(text, error = false) => setToast({ text, error })}>
      <div className="app-shell">
        {mobile && (
          <button
            className="sidebar-backdrop"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          />
        )}
        <aside className={`sidebar ${mobile ? 'open' : ''}`}>
          <a
            href="#dashboard"
            className="brand"
            onClick={(e) => {
              e.preventDefault();
              navigate('dashboard');
            }}
          >
            <span className="brand-icon">
              <ScanFace size={27} />
            </span>
            <span>
              ENROLL<span className="brand-light">-AI</span>
              <small>STUDENT PHOTO AUTOMATION</small>
            </span>
          </a>
          <div className="workspace-chip">
            <span>E</span>
            <div>
              Enrollment workspace<small>Local device</small>
            </div>
            <ChevronRight size={15} />
          </div>
          <div className="nav-label">WORKSPACE</div>
          <nav>
            {navigation.map((item) => (
              <button
                key={item.id}
                disabled={!!capture}
                className={(capture ? item.id === 'sessions' : page === item.id) ? 'active' : ''}
                onClick={() => navigate(item.id)}
              >
                <item.icon size={19} />
                {item.name}
                {(capture ? item.id === 'sessions' : page === item.id) && (
                  <span className="nav-active-dot" />
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-privacy">
              <ShieldCheck size={21} />
              <strong>Private by default.</strong>
              <p>
                On-device processing.
                <br />
                No face recognition.
              </p>
              <button disabled={!!capture} onClick={() => navigate('privacy')}>
                Learn more
                <ChevronRight size={14} />
              </button>
            </div>
            <nav>
              <button
                disabled={!!capture}
                className={page === 'settings' ? 'active' : ''}
                onClick={() => navigate('settings')}
              >
                <Settings size={19} />
                Settings
              </button>
              <button
                disabled={!!capture}
                className={page === 'privacy' ? 'active' : ''}
                onClick={() => navigate('privacy')}
              >
                <ShieldCheck size={19} />
                Privacy & data
              </button>
            </nav>
            <div className="sidebar-version">
              <span className="online-dot" />
              ENROLL-AI V1<span>LOCAL-FIRST</span>
            </div>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button mobile-menu"
                onClick={() => setMobile(true)}
                aria-label="Open navigation"
              >
                <Menu size={21} />
              </button>
              <span>Workspace</span>
              <ChevronRight size={14} />
              <strong>
                {capture
                  ? 'Capture station'
                  : page === 'settings'
                    ? 'Settings'
                    : page === 'privacy'
                      ? 'Privacy & data'
                      : navigation.find((n) => n.id === page)?.name}
              </strong>
            </div>
            <div className="topbar-right">
              <span className="connection-status">
                {!online ? <WifiOff size={14} /> : <span className="online-dot" />}
                {!online
                  ? 'Working offline'
                  : offlineReady || navigator.serviceWorker?.controller
                    ? 'Offline ready'
                    : 'Local workspace'}
              </span>
              {install && (
                <button
                  className="install-button"
                  onClick={async () => {
                    await install.prompt();
                    setInstall(null);
                  }}
                >
                  <ArrowDownToLine size={16} />
                  Install
                </button>
              )}
              <span className="topbar-divider" />
              <span className="device-avatar">
                <Monitor size={17} />
              </span>
            </div>
          </header>
          <main>
            {needRefresh && !capture && (
              <div className="update-banner">
                <span>A new app version is ready. Your local records will be retained.</span>
                <Button variant="secondary" onClick={() => void updateServiceWorker(true)}>
                  Update app
                </Button>
              </div>
            )}
            {!settings ? (
              <p>Opening local workspace…</p>
            ) : (
              <Suspense fallback={<p>Loading workspace…</p>}>
                {capture ? (
                  <CapturePage
                    key={`${capture.sessionId}:${capture.studentId || ''}`}
                    sessionId={capture.sessionId}
                    retakeStudentId={capture.studentId}
                    settings={settings}
                    onExit={() => void exitCapture()}
                  />
                ) : (
                  <motion.div
                    key={page}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    {page === 'dashboard' && (
                      <DashboardPage
                        onImport={() => setImportOpen(true)}
                        onCreate={() => setCreateOpen(true)}
                        onCapture={start}
                        onNavigate={navigate}
                      />
                    )}{' '}
                    {page === 'students' && <StudentsPage onImport={() => setImportOpen(true)} />}{' '}
                    {page === 'sessions' && (
                      <SessionsPage onCreate={() => setCreateOpen(true)} onCapture={start} />
                    )}{' '}
                    {page === 'history' && <HistoryPage onRetake={start} />}{' '}
                    {page === 'exports' && <ExportPage />}{' '}
                    {page === 'settings' && (
                      <SettingsPage settings={settings} onSaved={setSettings} />
                    )}{' '}
                    {page === 'privacy' && <PrivacyPage />}
                  </motion.div>
                )}
              </Suspense>
            )}
            <footer className="app-footer">
              <span>
                ENROLL-AI <span>·</span> Simple. Fast. Accurate.
              </span>
              <span>Built for better capture days.</span>
            </footer>
          </main>
        </div>
      </div>
      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onDone={() => {
            setImportOpen(false);
            navigate('students');
          }}
        />
      )}
      {createOpen && (
        <CreateSessionModal
          onClose={() => setCreateOpen(false)}
          onDone={() => {
            setCreateOpen(false);
            navigate('sessions');
          }}
        />
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? 'error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span>{toast.text}</span>
          <button aria-label="Dismiss message" onClick={() => setToast(null)}>
            <X size={17} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <div className="fatal">
        <AlertCircle size={36} />
        <h1>The app encountered a problem</h1>
        <p>{this.state.error}</p>
        <p>Previously saved photos remain in local storage.</p>
        <Button onClick={() => location.reload()}>Reload workspace</Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
