import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppHeader } from './components/layout/AppHeader';
import { PageContainer } from './components/layout/PageContainer';
import { AnalyzerPage } from './pages/AnalyzerPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { CategoryDetailPage } from './pages/CategoryDetailPage';
import { MapPage } from './pages/MapPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { StackDetailPage } from './pages/StackDetailPage';
import { StacksPage } from './pages/StacksPage';
import { AnalyzerSessionProvider, useAnalyzerSession } from './analyzer';
import { analyzerRoot, analyzerRoutes } from './utils/routes';

export default function App() {
  return (
    <AnalyzerSessionProvider>
      <AppRoutes />
    </AnalyzerSessionProvider>
  );
}

function AppRoutes() {
  const { pathname } = useLocation();
  const isAnalyzer = pathname.startsWith('/analyzer');
  return (
    <div className="app-shell">
      <AppHeader />
      <PageContainer>
        <Routes>
          <Route path="/" element={<Navigate to="/dictionary/map" replace />} />
          <Route path={analyzerRoot} element={<AnalyzerIndexRedirect />} />
          <Route path="/analyzer/:view" element={<AnalyzerPage />} />
          <Route path="/dictionary" element={<Navigate to="/dictionary/map" replace />} />
          <Route path="/dictionary/map" element={<MapPage />} />
          <Route path="/dictionary/categories" element={<CategoriesPage />} />
          <Route path="/dictionary/categories/:categoryId" element={<CategoryDetailPage />} />
          <Route path="/dictionary/stacks" element={<StacksPage />} />
          <Route path="/dictionary/stacks/:stackId" element={<StackDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </PageContainer>
      <footer className="app-footer">
        <span>Web Atlas / {isAnalyzer ? 'Analyzer' : 'Dictionary'}</span>
        <span>{isAnalyzer ? 'Local Evidence Graph' : 'Phase 1 · Technical Dictionary'}</span>
      </footer>
    </div>
  );
}

function AnalyzerIndexRedirect() {
  const { state } = useAnalyzerSession();
  return <Navigate to={analyzerRoutes[state.activeView]} replace />;
}
