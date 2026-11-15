import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { BottomNav, DevnetBadge, Loading } from './design/components';
import { StoreProvider, useStore } from './lib/store';
import { Contacts } from './screens/Contacts';
import { Home } from './screens/Home';
import { Onboarding } from './screens/Onboarding';
import { Receive } from './screens/Receive';
import { Send } from './screens/Send';
import { Settings } from './screens/Settings';

function Shell() {
  const { ready, wallet } = useStore();
  if (!ready) return <Loading label="Opening wallet" />;
  if (!wallet) return <Onboarding />;
  return (
    <>
      <div className="topbar">
        <strong className="logo">Tap</strong>
        <DevnetBadge />
      </div>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/receive" element={<Receive />} />
        <Route path="/send" element={<Send />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </>
  );
}

export function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <div className="app">
          <Shell />
        </div>
      </BrowserRouter>
    </StoreProvider>
  );
}
