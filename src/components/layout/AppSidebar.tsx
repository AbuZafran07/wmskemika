import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ClipboardList,
  ArrowDownToLine,
  Database,
  ShoppingCart,
  ArrowUpFromLine,
  Settings2,
  FileText,
  Users,
  ChevronDown,
  ChevronRight,
  Boxes,
  Tags,
  Ruler,
  Building2,
  UserCircle,
  FileBarChart,
  ClipboardCheck,
  History,
  Menu,
  X,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface MenuItem {
  key: string;
  labelKey: string;
  icon: React.ElementType;
  href?: string;
  subLabelKey?: string;
  children?: MenuItem[];
  roles?: string[];
}

const menuItems: { groupKey: string; items: MenuItem[] }[] = [
  {
    groupKey: 'menu.summary',
    items: [
      { key: 'dashboard', labelKey: 'menu.dashboard', icon: LayoutDashboard, href: '/dashboard' },
    ],
  },
  {
    groupKey: 'menu.transactions',
    items: [
      { key: 'planOrder', labelKey: 'menu.planOrder', subLabelKey: 'menu.planOrderSub', icon: ClipboardList, href: '/plan-order' },
      { key: 'stockIn', labelKey: 'menu.stockIn', subLabelKey: 'menu.stockInSub', icon: ArrowDownToLine, href: '/stock-in' },
      { key: 'salesOrder', labelKey: 'menu.salesOrder', subLabelKey: 'menu.salesOrderSub', icon: ShoppingCart, href: '/sales-order' },
      { key: 'stockOut', labelKey: 'menu.stockOut', subLabelKey: 'menu.stockOutSub', icon: ArrowUpFromLine, href: '/stock-out' },
      { key: 'stockAdjustment', labelKey: 'menu.stockAdjustment', icon: Settings2, href: '/stock-adjustment' },
    ],
  },
  {
    groupKey: 'menu.masterData',
    items: [
      {
        key: 'dataProduct',
        labelKey: 'menu.dataProduct',
        icon: Package,
        children: [
          { key: 'products', labelKey: 'menu.products', icon: Boxes, href: '/data-product/products' },
          { key: 'categories', labelKey: 'menu.categories', icon: Tags, href: '/data-product/categories' },
          { key: 'units', labelKey: 'menu.units', icon: Ruler, href: '/data-product/units' },
          { key: 'suppliers', labelKey: 'menu.suppliers', icon: Building2, href: '/data-product/suppliers' },
          { key: 'customers', labelKey: 'menu.customers', icon: UserCircle, href: '/data-product/customers' },
        ],
      },
      { key: 'dataStock', labelKey: 'menu.dataStock', icon: Database, href: '/data-stock' },
      { key: 'userManagement', labelKey: 'menu.userManagement', icon: Users, href: '/user-management', roles: ['super_admin'] },
    ],
  },
  {
    groupKey: 'menu.reports',
    items: [
      { key: 'stockReport', labelKey: 'menu.stockReport', icon: FileText, href: '/reports/stock' },
      { key: 'inboundReport', labelKey: 'menu.inboundReport', icon: FileBarChart, href: '/reports/inbound' },
      { key: 'outboundReport', labelKey: 'menu.outboundReport', icon: FileBarChart, href: '/reports/outbound' },
      { key: 'adjustmentLog', labelKey: 'menu.adjustmentLog', icon: ClipboardCheck, href: '/reports/adjustment' },
      { key: 'auditLog', labelKey: 'menu.auditLog', icon: History, href: '/reports/audit' },
    ],
  },
];

interface AppSidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export default function AppSidebar({ isCollapsed, onToggle }: AppSidebarProps) {
  const { t } = useLanguage();
  const { user, hasPermission } = useAuth();
  const location = useLocation();
  const [expandedItems, setExpandedItems] = useState<string[]>(['dataProduct']);

  const toggleExpanded = (key: string) => {
    setExpandedItems(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const isActive = (href: string) => location.pathname === href;
  const isParentActive = (children: MenuItem[]) =>
    children.some(child => child.href && location.pathname.startsWith(child.href));

  const renderMenuItem = (item: MenuItem, depth = 0) => {
    // Check role permission
    if (item.roles && !hasPermission(item.roles as any)) {
      return null;
    }

    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.includes(item.key);
    const active = item.href ? isActive(item.href) : hasChildren && isParentActive(item.children!);
    const Icon = item.icon;

    if (hasChildren) {
      return (
        <div key={item.key}>
          <button
            onClick={() => toggleExpanded(item.key)}
            className={cn(
              'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all duration-200',
              'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              active && 'bg-sidebar-accent text-sidebar-primary'
            )}
          >
            <div className="flex items-center gap-3">
              <Icon className="w-5 h-5" />
              {!isCollapsed && <span>{t(item.labelKey)}</span>}
            </div>
            {!isCollapsed && (
              isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
            )}
          </button>
          {!isCollapsed && isExpanded && (
            <div className="ml-4 mt-1 space-y-1 border-l border-sidebar-border pl-3">
              {item.children!.map(child => renderMenuItem(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <NavLink
        key={item.key}
        to={item.href!}
        className={({ isActive: navActive }) =>
          cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200',
            'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            (navActive || active) && 'bg-sidebar-accent text-sidebar-primary font-medium border-l-2 border-sidebar-primary -ml-0.5 pl-[14px]'
          )
        }
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        {!isCollapsed && (
          <div className="flex flex-col">
            <span>{t(item.labelKey)}</span>
            {item.subLabelKey && (
              <span className="text-xs text-sidebar-muted">{t(item.subLabelKey)}</span>
            )}
          </div>
        )}
      </NavLink>
    );
  };

  return (
    <>
      {/* Mobile overlay */}
      {!isCollapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-full sidebar-gradient z-50 transition-all duration-300 flex flex-col',
          'lg:relative lg:z-0',
          isCollapsed ? 'w-0 lg:w-16 overflow-hidden' : 'w-64'
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-sidebar-border">
          <div className="p-2 bg-sidebar-primary/20 rounded-lg flex-shrink-0">
            <Package className="w-6 h-6 text-sidebar-primary" />
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <h1 className="font-display font-bold text-sidebar-foreground truncate">
                {t('app.name')}
              </h1>
              <p className="text-xs text-sidebar-muted truncate">{t('app.subtitle')}</p>
            </div>
          )}
          <Button
            variant="ghost"
            size="iconSm"
            onClick={onToggle}
            className="lg:hidden text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-6">
          {menuItems.map(group => (
            <div key={group.groupKey}>
              {!isCollapsed && (
                <h2 className="px-3 mb-2 text-xs font-semibold text-sidebar-muted uppercase tracking-wider">
                  {t(group.groupKey)}
                </h2>
              )}
              <div className="space-y-1">
                {group.items.map(item => renderMenuItem(item))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border">
          {!isCollapsed && (
            <p className="text-xs text-sidebar-muted text-center">
              © 2026 PT. Kemika Karya Pratama
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
