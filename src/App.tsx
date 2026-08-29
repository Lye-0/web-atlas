import { Navigate, Route, Routes } from 'react-router-dom';
import { AppHeader } from './components/layout/AppHeader';
import { PageContainer } from './components/layout/PageContainer';
import { CategoriesPage } from './pages/CategoriesPage';
import { CategoryDetailPage } from './pages/CategoryDetailPage';
import { MapPage } from './pages/MapPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { StackDetailPage } from './pages/StackDetailPage';
import { StacksPage } from './pages/StacksPage';

export default function App() {
  return (
    <div className="app-shell">
      <AppHeader />
      <PageContainer>
        <Routes>
          <Route path="/" element={<Navigate to="/dictionary/map" replace />} />
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
        <span>Web Atlas / Dictionary</span>
        <span>Phase 1 · Technical Dictionary</span>
      </footer>
    </div>
  );
}
