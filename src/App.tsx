import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";

// Pages
import Login from "./pages/Login";
import MainLayout from "./components/layout/MainLayout";
import Dashboard from "./pages/Dashboard";
import PlanOrder from "./pages/PlanOrder";
import StockIn from "./pages/StockIn";
import SalesOrder from "./pages/SalesOrder";
import StockOut from "./pages/StockOut";
import StockAdjustment from "./pages/StockAdjustment";
import DataStock from "./pages/DataStock";
import UserManagement from "./pages/UserManagement";
import SettingsPage from "./pages/Settings";

// Data Product
import Products from "./pages/data-product/Products";
import Categories from "./pages/data-product/Categories";
import Units from "./pages/data-product/Units";
import Suppliers from "./pages/data-product/Suppliers";
import Customers from "./pages/data-product/Customers";

// Reports
import StockReport from "./pages/reports/StockReport";
import InboundReport from "./pages/reports/InboundReport";
import OutboundReport from "./pages/reports/OutboundReport";
import AdjustmentLog from "./pages/reports/AdjustmentLog";
import AuditLog from "./pages/reports/AuditLog";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                
                <Route element={<MainLayout />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  
                  {/* Transactions */}
                  <Route path="/plan-order" element={<PlanOrder />} />
                  <Route path="/stock-in" element={<StockIn />} />
                  <Route path="/sales-order" element={<SalesOrder />} />
                  <Route path="/stock-out" element={<StockOut />} />
                  <Route path="/stock-adjustment" element={<StockAdjustment />} />
                  
                  {/* Master Data */}
                  <Route path="/data-product/products" element={<Products />} />
                  <Route path="/data-product/categories" element={<Categories />} />
                  <Route path="/data-product/units" element={<Units />} />
                  <Route path="/data-product/suppliers" element={<Suppliers />} />
                  <Route path="/data-product/customers" element={<Customers />} />
                  <Route path="/data-stock" element={<DataStock />} />
                  <Route path="/user-management" element={<UserManagement />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  
                  {/* Reports */}
                  <Route path="/reports/stock" element={<StockReport />} />
                  <Route path="/reports/inbound" element={<InboundReport />} />
                  <Route path="/reports/outbound" element={<OutboundReport />} />
                  <Route path="/reports/adjustment" element={<AdjustmentLog />} />
                  <Route path="/reports/audit" element={<AuditLog />} />
                </Route>
                
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
