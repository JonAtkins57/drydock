import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/store';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import Vendors from './pages/Vendors';
import Accounts from './pages/Accounts';
import Periods from './pages/Periods';
import Leads from './pages/Leads';
import Opportunities from './pages/Opportunities';
import Activities from './pages/Activities';
import JournalEntries from './pages/JournalEntries';
import TrialBalance from './pages/TrialBalance';
import CustomFields from './pages/CustomFields';
import Workflows from './pages/Workflows';
import { EmployeesPage, ItemsPage, LocationsPage, ProjectsPage } from './pages/MasterDataPages';

export default function App() {
  const { init, token } = useAuth();

  useEffect(() => {
    init();
  }, [init]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/customers" element={<Customers />} />
      <Route path="/vendors" element={<Vendors />} />
      <Route path="/accounts" element={<Accounts />} />
      <Route path="/periods" element={<Periods />} />
      <Route path="/leads" element={<Leads />} />
      <Route path="/opportunities" element={<Opportunities />} />
      <Route path="/activities" element={<Activities />} />
      <Route path="/journal-entries" element={<JournalEntries />} />
      <Route path="/trial-balance" element={<TrialBalance />} />
      <Route path="/custom-fields" element={<CustomFields />} />
      <Route path="/workflows" element={<Workflows />} />
      <Route path="/employees" element={<EmployeesPage />} />
      <Route path="/items" element={<ItemsPage />} />
      <Route path="/locations" element={<LocationsPage />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/" element={token ? <Navigate to="/dashboard" /> : <Navigate to="/login" />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
