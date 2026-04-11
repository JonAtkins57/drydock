import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/store';
import Landing from './pages/Landing';
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
import Requisitions from './pages/Requisitions';
import PurchaseOrders from './pages/PurchaseOrders';
import ApProcessingConsole from './pages/ApProcessingConsole';
import ApInvoiceDetail from './pages/ApInvoiceDetail';
import GoodsReceipts from './pages/GoodsReceipts';
import Quotes from './pages/Quotes';
import SalesOrders from './pages/SalesOrders';
import Invoices from './pages/Invoices';
import BillingPlans from './pages/BillingPlans';
import Statement from './pages/Statement';
import CreditMemos from './pages/q2c/CreditMemos';
import RevRec from './pages/q2c/RevRec';
import FixedAssets from './pages/FixedAssets';
import IncomeStatement from './pages/reports/IncomeStatement';
import BalanceSheet from './pages/reports/BalanceSheet';
import RecurringJournals from './pages/RecurringJournals';
import BalanceSheetRollForward from './pages/reports/BalanceSheetRollForward';
import LeaseContracts from './pages/LeaseContracts';
import WorkOrders from './pages/WorkOrders';
import Budgets from './pages/Budgets';
import PricingRateCards from './pages/PricingRateCards';

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
      <Route path="/requisitions" element={<Requisitions />} />
      <Route path="/purchase-orders" element={<PurchaseOrders />} />
      <Route path="/ap-console" element={<ApProcessingConsole />} />
      <Route path="/ap-invoices/:id" element={<ApInvoiceDetail />} />
      <Route path="/goods-receipts" element={<GoodsReceipts />} />
      <Route path="/quotes" element={<Quotes />} />
      <Route path="/orders" element={<SalesOrders />} />
      <Route path="/invoices" element={<Invoices />} />
      <Route path="/billing-plans" element={<BillingPlans />} />
      <Route path="/credit-memos" element={<CreditMemos />} />
      <Route path="/rev-rec" element={<RevRec />} />
      <Route path="/customers/:id/statement" element={<Statement />} />
      <Route path="/reports/income-statement" element={<IncomeStatement />} />
      <Route path="/reports/balance-sheet" element={<BalanceSheet />} />
      <Route path="/recurring-journals" element={<RecurringJournals />} />
      <Route path="/reports/balance-sheet-rollforward" element={<BalanceSheetRollForward />} />
      <Route path="/leases" element={<LeaseContracts />} />
      <Route path="/assets" element={<FixedAssets />} />
      <Route path="/work-orders" element={<WorkOrders />} />
      <Route path="/budgets" element={<Budgets />} />
      <Route path="/pricing/rate-cards" element={<PricingRateCards />} />
      <Route path="/" element={token ? <Navigate to="/dashboard" /> : <Landing />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
