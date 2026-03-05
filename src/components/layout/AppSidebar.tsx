import React, { useState, useRef, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
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
  Package,
  TrendingUpDown,
  CalendarClock,
  Truck,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { canAccessMenu, MenuKey } from "@/lib/permissions";

interface MenuItem {
  key: string;
  menuKey?: MenuKey; // Maps to permission system
  labelKey: string;
  icon: React.ElementType;
  href?: string;
  subLabelKey?: string;
  children?: MenuItem[];
}

/**
 * Menu structure with permission keys
 * Settings and User Management only visible to super_admin
 */
const menuItems: { groupKey: string; items: MenuItem[] }[] = [
  {
    groupKey: "menu.summary",
    items: [
      { 
        key: "dashboard", 
        menuKey: "dashboard",
        labelKey: "menu.dashboard", 
        icon: LayoutDashboard, 
        href: "/dashboard" 
      }
    ],
  },
  {
    groupKey: "menu.transactions",
    items: [
      {
        key: "planOrder",
        menuKey: "planOrder",
        labelKey: "menu.planOrder",
        subLabelKey: "menu.planOrderSub",
        icon: ClipboardList,
        href: "/plan-order",
      },
      {
        key: "stockIn",
        menuKey: "stockIn",
        labelKey: "menu.stockIn",
        subLabelKey: "menu.stockInSub",
        icon: ArrowDownToLine,
        href: "/stock-in",
      },
      {
        key: "salesOrder",
        menuKey: "salesOrder",
        labelKey: "menu.salesOrder",
        subLabelKey: "menu.salesOrderSub",
        icon: ShoppingCart,
        href: "/sales-order",
      },
      {
        key: "stockOut",
        menuKey: "stockOut",
        labelKey: "menu.stockOut",
        subLabelKey: "menu.stockOutSub",
        icon: ArrowUpFromLine,
        href: "/stock-out",
      },
      { 
        key: "stockAdjustment", 
        menuKey: "stockAdjustment",
        labelKey: "menu.stockAdjustment", 
        icon: Settings2, 
        href: "/stock-adjustment" 
      },
    ],
  },
  {
    groupKey: "menu.masterData",
    items: [
      {
        key: "dataProduct",
        labelKey: "menu.dataProduct",
        icon: Package,
        children: [
          { key: "products", menuKey: "products", labelKey: "menu.products", icon: Boxes, href: "/data-product/products" },
          { key: "categories", menuKey: "categories", labelKey: "menu.categories", icon: Tags, href: "/data-product/categories" },
          { key: "units", menuKey: "units", labelKey: "menu.units", icon: Ruler, href: "/data-product/units" },
          { key: "suppliers", menuKey: "suppliers", labelKey: "menu.suppliers", icon: Building2, href: "/data-product/suppliers" },
          { key: "customers", menuKey: "customers", labelKey: "menu.customers", icon: UserCircle, href: "/data-product/customers" },
        ],
      },
      { 
        key: "dataStock", 
        menuKey: "dataStock",
        labelKey: "menu.dataStock", 
        icon: Database, 
        href: "/data-stock" 
      },
      {
        key: "userManagement",
        menuKey: "userManagement",
        labelKey: "menu.userManagement",
        icon: Users,
        href: "/user-management",
      },
      {
        key: "settings",
        menuKey: "settings",
        labelKey: "menu.settings",
        icon: Settings2,
        href: "/settings",
      },
    ],
  },
  {
    groupKey: "menu.reports",
    items: [
      { key: "stockReport", menuKey: "stockReport", labelKey: "menu.stockReport", icon: FileText, href: "/reports/stock" },
      { key: "inboundReport", menuKey: "inboundReport", labelKey: "menu.inboundReport", icon: FileBarChart, href: "/reports/inbound" },
      { key: "outboundReport", menuKey: "outboundReport", labelKey: "menu.outboundReport", icon: FileBarChart, href: "/reports/outbound" },
      { key: "stockMovement", menuKey: "stockMovement", labelKey: "menu.stockMovement", icon: TrendingUpDown, href: "/reports/movement" },
      { key: "expiryAlert", menuKey: "expiryAlert", labelKey: "menu.expiryAlert", icon: CalendarClock, href: "/reports/expiry" },
      { key: "adjustmentLog", menuKey: "adjustmentLog", labelKey: "menu.adjustmentLog", icon: ClipboardCheck, href: "/reports/adjustment" },
      { key: "auditLog", menuKey: "auditLog", labelKey: "menu.auditLog", icon: History, href: "/reports/audit" },
    ],
  },
];

interface AppSidebarProps {
  isMobile: boolean;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: () => void;
}

const SCROLL_POSITION_KEY = "sidebar-scroll-position";

export default function AppSidebar({ isMobile, isOpen, onClose, onNavigate }: AppSidebarProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const location = useLocation();
  const [expandedItems, setExpandedItems] = useState<string[]>(["dataProduct"]);
  const scrollContainerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const savedScrollPosition = sessionStorage.getItem(SCROLL_POSITION_KEY);
    if (savedScrollPosition && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = parseInt(savedScrollPosition, 10);
    }
  }, []);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      sessionStorage.setItem(SCROLL_POSITION_KEY, scrollContainerRef.current.scrollTop.toString());
    }
  };

  useEffect(() => {
    const activeElement = scrollContainerRef.current?.querySelector('[data-active="true"]');
    if (activeElement) activeElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [location.pathname]);

  const toggleExpanded = (key: string) => {
    setExpandedItems((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const isActive = (href: string) => location.pathname === href;
  const isParentActive = (children: MenuItem[]) =>
    children.some((child) => child.href && location.pathname.startsWith(child.href));

  const handleNavClick = () => {
    if (isMobile) onNavigate();
  };

  /**
   * Check if user can access a menu item
   * HIDE items user cannot access (not disable)
   */
  const canAccess = (item: MenuItem): boolean => {
    if (!user) return false;
    
    // If item has menuKey, check permission
    if (item.menuKey) {
      return canAccessMenu(user.role, item.menuKey);
    }
    
    // For parent items with children, check if any child is accessible
    if (item.children) {
      return item.children.some(child => canAccess(child));
    }
    
    return true;
  };

  /**
   * Filter children that user can access
   */
  const getAccessibleChildren = (children: MenuItem[]): MenuItem[] => {
    return children.filter(child => canAccess(child));
  };

  const renderMenuItem = (item: MenuItem, depth = 0) => {
    // HIDE menu items user cannot access
    if (!canAccess(item)) return null;

    const hasChildren = item.children && item.children.length > 0;
    
    // For parent with children, only show if has accessible children
    if (hasChildren) {
      const accessibleChildren = getAccessibleChildren(item.children!);
      if (accessibleChildren.length === 0) return null;
    }
    
    const isExpanded = expandedItems.includes(item.key);
    const active = item.href ? isActive(item.href) : hasChildren && isParentActive(item.children!);
    const Icon = item.icon;

    if (hasChildren) {
      const accessibleChildren = getAccessibleChildren(item.children!);
      
      return (
        <div key={item.key}>
          <button
            onClick={() => toggleExpanded(item.key)}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all duration-200",
              "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-sidebar-accent text-sidebar-primary",
            )}
          >
            <div className="flex items-center gap-3">
              <Icon className="w-5 h-5" />
              <span>{t(item.labelKey)}</span>
            </div>
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          {isExpanded && (
            <div className="ml-4 mt-1 space-y-1 border-l border-sidebar-border pl-3">
              {accessibleChildren.map((child) => renderMenuItem(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <NavLink
        key={item.key}
        to={item.href!}
        onClick={handleNavClick}
        data-active={active}
        className={({ isActive: navActive }) =>
          cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200",
            "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            (navActive || active) &&
              "bg-sidebar-accent text-sidebar-primary font-medium border-l-2 border-sidebar-primary -ml-0.5 pl-[14px]",
          )
        }
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        <div className="flex flex-col">
          <span>{t(item.labelKey)}</span>
          {item.subLabelKey && <span className="text-xs text-sidebar-foreground/70">{t(item.subLabelKey)}</span>}
        </div>
      </NavLink>
    );
  };

  /**
   * Filter groups that have at least one accessible item
   */
  const getVisibleGroups = () => {
    return menuItems.filter(group => {
      return group.items.some(item => canAccess(item));
    });
  };

  const visibleGroups = getVisibleGroups();

  return (
    <aside className={cn("h-full sidebar-gradient sidebar-shadow flex flex-col", isMobile ? "w-full" : "w-full")}>
      {/* Navigation - scrollable */}
      <nav ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-3 space-y-6">
        {visibleGroups.map((group) => {
          const visibleItems = group.items.filter(item => canAccess(item));
          if (visibleItems.length === 0) return null;
          
          return (
            <div key={group.groupKey}>
              <h2 className="px-3 mb-2 text-xs font-semibold text-sidebar-foreground/80 uppercase tracking-wider">
                {t(group.groupKey)}
              </h2>

              <div className="space-y-1">{visibleItems.map((item) => renderMenuItem(item))}</div>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border flex-shrink-0">
        <p className="text-xs text-sidebar-foreground/60 text-center">© 2026 PT. Kemika Karya Pratama</p>
      </div>
    </aside>
  );
}
