import { useEffect } from 'react';
import { testConnection } from './lib/firebase';
import { StorefrontPage } from './components/StorefrontPage';
import { ChefDashboardPage } from './components/ChefDashboardPage';

export default function App() {
  useEffect(() => {
    void testConnection();
  }, []);

  const isChefRoute =
    typeof window !== 'undefined' &&
    window.location.pathname.replace(/\/+$/, '') === '/chef';

  return isChefRoute ? <ChefDashboardPage /> : <StorefrontPage />;
}
