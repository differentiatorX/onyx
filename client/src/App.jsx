// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import { Login, Register } from './pages/Auth.jsx';
import Overview from './pages/Overview.jsx';
import Payments from './pages/Payments.jsx';
import PaymentDetail from './pages/PaymentDetail.jsx';
import Ledger from './pages/Ledger.jsx';
import Webhooks from './pages/Webhooks.jsx';
import Settlements from './pages/Settlements.jsx';
import Reconciliation from './pages/Reconciliation.jsx';
import Developers from './pages/Developers.jsx';
import Checkout from './pages/Checkout.jsx';

function Protected({ children }) {
  const { merchant, loading } = useAuth();
  if (loading) return <div className="boot">Loading…</div>;
  if (!merchant) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/checkout/:id" element={<Checkout />} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route index element={<Overview />} />
            <Route path="payments" element={<Payments />} />
            <Route path="payments/:id" element={<PaymentDetail />} />
            <Route path="ledger" element={<Ledger />} />
            <Route path="webhooks" element={<Webhooks />} />
            <Route path="settlements" element={<Settlements />} />
            <Route path="reconciliation" element={<Reconciliation />} />
            <Route path="developers" element={<Developers />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
