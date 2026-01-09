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
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

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
    groupKey: "menu.summary",
    items: [{ key: "dashboard", labelKey: "menu.dashboard", icon: LayoutDashboard, href: "/dashboard" }],
  },
  {
    groupKey: "menu.transactions",
    items: [
      {
        key: "planOrder",
        labelKey: "menu.planOrder",
        subLabelKey: "menu.planOrderSub",
        icon: ClipboardList,
        href: "/plan-order",
      },
      {
        key: "stockIn",
        labelKey: "menu.stockIn",
        subLabelKey: "menu.stockInSub",
        icon: ArrowDownToLine,
        href: "/stock-in",
      },
      {
        key: "salesOrder",
        labelKey: "menu.salesOrder",
        subLabelKey: "menu.salesOrderSub",
        icon: ShoppingCart,
        href: "/sales-order",
      },
      {
        key: "stockOut",
        labelKey: "menu.stockOut",
        subLabelKey: "menu.stockOutSub",
        icon: ArrowUpFromLine,
        href: "/stock-out",
      },
      { key: "stockAdjustment", labelKey: "menu.stockAdjustment", icon: Settings2, href: "/stock-adjustment" },
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
          { key: "products", labelKey: "menu.products", icon: Boxes, href: "/data-product/products" },
          { key: "categories", labelKey: "menu.categories", icon: Tags, href: "/data-product/categories" },
          { key: "units", labelKey: "menu.units", icon: Ruler, href: "/data-product/units" },
          { key: "suppliers", labelKey: "menu.suppliers", icon: Building2, href: "/data-product/suppliers" },
          { key: "customers", labelKey: "menu.customers", icon: UserCircle, href: "/data-product/customers" },
        ],
      },
      { key: "dataStock", labelKey: "menu.dataStock", icon: Database, href: "/data-stock" },
      {
        key: "userManagement",
        labelKey: "menu.userManagement",
        icon: Users,
        href: "/user-management",
        roles: ["super_admin"],
      },
      {
        key: "settings",
        labelKey: "menu.settings",
        icon: Settings2,
        href: "/settings",
        roles: ["super_admin", "admin"],
      },
    ],
  },
  {
    groupKey: "menu.reports",
    items: [
      { key: "stockReport", labelKey: "menu.stockReport", icon: FileText, href: "/reports/stock" },
      { key: "inboundReport", labelKey: "menu.inboundReport", icon: FileBarChart, href: "/reports/inbound" },
      { key: "outboundReport", labelKey: "menu.outboundReport", icon: FileBarChart, href: "/reports/outbound" },
      { key: "stockMovement", labelKey: "menu.stockMovement", icon: TrendingUpDown, href: "/reports/movement" },
      { key: "expiryAlert", labelKey: "menu.expiryAlert", icon: CalendarClock, href: "/reports/expiry" },
      { key: "adjustmentLog", labelKey: "menu.adjustmentLog", icon: ClipboardCheck, href: "/reports/adjustment" },
      { key: "auditLog", labelKey: "menu.auditLog", icon: History, href: "/reports/audit" },
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
  const { hasPermission } = useAuth();
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

  const renderMenuItem = (item: MenuItem, depth = 0) => {
    if (item.roles && !hasPermission(item.roles as any)) return null;

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
              {item.children!.map((child) => renderMenuItem(child, depth + 1))}
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

  return (
    <aside className={cn("h-full sidebar-gradient sidebar-shadow flex flex-col", isMobile ? "w-full" : "w-full")}>
      {/* Navigation - scrollable */}
      <nav ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-3 space-y-6">
        {menuItems.map((group) => (
          <div key={group.groupKey}>
            {/* ✅ FIX: header group dibuat putih agar terlihat di mode light/dark */}
            <h2 className="px-3 mb-2 text-xs font-semibold text-sidebar-foreground/80 uppercase tracking-wider">
              {t(group.groupKey)}
            </h2>

            <div className="space-y-1">{group.items.map((item) => renderMenuItem(item))}</div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border flex-shrink-0">
        {/* ✅ FIX: footer dibuat putih soft agar selalu terlihat */}
        <p className="text-xs text-sidebar-foreground/60 text-center">© 2026 PT. Kemika Karya Pratama</p>
      </div>
    </aside>
  );
}
