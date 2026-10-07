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
  FlaskConical,
  History,
  Package,
  TrendingUpDown,
  CalendarClock,
  Truck,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { canAccessMenu, MenuKey } from "@/lib/permissions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

interface MenuItem {
  key: string;
  menuKey?: MenuKey;
  labelKey: string;
  icon: React.ElementType;
  href?: string;
  subLabelKey?: string;
  children?: MenuItem[];
}

const menuItems: { groupKey: string; items: MenuItem[] }[] = [
  {
    groupKey: "menu.summary",
    items: [
      { key: "dashboard", menuKey: "dashboard", labelKey: "menu.dashboard", icon: LayoutDashboard, href: "/dashboard" },
      { key: "requestDelivery", menuKey: "requestDelivery", labelKey: "menu.requestDelivery", subLabelKey: "menu.requestDeliverySub", icon: Truck, href: "/request-delivery" },
      { key: "trackerPO", menuKey: "trackerPO", labelKey: "menu.trackerPO", subLabelKey: "menu.trackerPOSub", icon: ClipboardCheck, href: "/tracker-po" },
    ],
  },
  {
    groupKey: "menu.calibration",
    items: [
      { key: "trackerKalibrasi", menuKey: "trackerKalibrasi", labelKey: "menu.trackerKalibrasi", subLabelKey: "menu.trackerKalibrasiSub", icon: FlaskConical, href: "/tracker-kalibrasi" },
      { key: "arsipSertifikat", menuKey: "arsipSertifikat", labelKey: "menu.arsipSertifikat", subLabelKey: "menu.arsipSertifikatSub", icon: FileText, href: "/arsip-sertifikat" },
    ],
  },
  {
    groupKey: "menu.transactions",
    items: [
      { key: "planOrder", menuKey: "planOrder", labelKey: "menu.planOrder", subLabelKey: "menu.planOrderSub", icon: ClipboardList, href: "/plan-order" },
      { key: "stockIn", menuKey: "stockIn", labelKey: "menu.stockIn", subLabelKey: "menu.stockInSub", icon: ArrowDownToLine, href: "/stock-in" },
      { key: "salesOrder", menuKey: "salesOrder", labelKey: "menu.salesOrder", subLabelKey: "menu.salesOrderSub", icon: ShoppingCart, href: "/sales-order" },
      { key: "proformaInvoice", menuKey: "proformaInvoice", labelKey: "menu.proformaInvoice", subLabelKey: "menu.proformaInvoiceSub", icon: Receipt, href: "/proforma-invoice" },
      { key: "stockOut", menuKey: "stockOut", labelKey: "menu.stockOut", subLabelKey: "menu.stockOutSub", icon: ArrowUpFromLine, href: "/stock-out" },
      { key: "deliveryOrder", menuKey: "deliveryOrder", labelKey: "menu.deliveryOrder", subLabelKey: "menu.deliveryOrderSub", icon: FileText, href: "/delivery-order" },
      { key: "stockAdjustment", menuKey: "stockAdjustment", labelKey: "menu.stockAdjustment", icon: Settings2, href: "/stock-adjustment" },
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
      { key: "dataStock", menuKey: "dataStock", labelKey: "menu.dataStock", icon: Database, href: "/data-stock" },
      { key: "userManagement", menuKey: "userManagement", labelKey: "menu.userManagement", icon: Users, href: "/user-management" },
      { key: "settings", menuKey: "settings", labelKey: "menu.settings", icon: Settings2, href: "/settings" },
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
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClose: () => void;
  onNavigate: () => void;
}

const SCROLL_POSITION_KEY = "sidebar-scroll-position";

function activeGroup(pathname: string) {
  return menuItems.find(group => group.groupKey !== "menu.summary" && group.items.some(item =>
    item.href === pathname || item.children?.some(child => child.href === pathname)
  ))?.groupKey ?? null;
}

export default function AppSidebar({ isMobile, isCollapsed, onToggleCollapse, onNavigate }: AppSidebarProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const location = useLocation();
  const compact = isCollapsed && !isMobile;
  const [openGroup, setOpenGroup] = useState<string | null>(() => activeGroup(location.pathname));
  const [expandedItems, setExpandedItems] = useState<string[]>(["dataProduct"]);
  const scrollContainerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(SCROLL_POSITION_KEY);
    if (saved && scrollContainerRef.current) scrollContainerRef.current.scrollTop = parseInt(saved, 10);
  }, []);

  useEffect(() => {
    const group = activeGroup(location.pathname);
    if (group) setOpenGroup(group);
    const parent = menuItems.flatMap(group => group.items).find(item => item.children?.some(child => child.href === location.pathname));
    if (parent) setExpandedItems(prev => prev.includes(parent.key) ? prev : [...prev, parent.key]);
  }, [location.pathname]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollContainerRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, openGroup, compact]);

  const canAccess = (item: MenuItem): boolean => {
    if (!user) return false;
    if (item.menuKey) return canAccessMenu(user.role, item.menuKey);
    if (item.children) return item.children.some(canAccess);
    return true;
  };
  const isActive = (item: MenuItem): boolean => item.href === location.pathname || Boolean(item.children?.some(isActive));
  const handleNavigate = () => { if (isMobile) onNavigate(); };

  const renderMenuItem = (item: MenuItem, inGroup = false, depth = 0): React.ReactNode => {
    if (!canAccess(item)) return null;
    const children = item.children?.filter(canAccess) ?? [];
    const active = isActive(item);
    const Icon = item.icon;
    const itemClasses = cn(
      "relative flex items-center rounded-lg font-medium transition-colors duration-200 motion-reduce:transition-none",
      compact ? "h-10 w-10 justify-center mx-auto" : inGroup ? "gap-3 pl-7 pr-3 py-2 text-[13px]" : "gap-3 px-3 py-2.5 text-sm",
      !compact && depth > 0 && "pl-10",
      active ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
    );
    const content = <>
      {active && <span aria-hidden="true" className="sidebar-active-indicator" />}
      <Icon className={cn("shrink-0", compact ? "w-5 h-5" : inGroup ? "w-4 h-4" : "w-[18px] h-[18px]")} />
      {!compact && <div className="min-w-0 flex-1 text-left">
        <span className="block whitespace-normal break-words leading-tight">{t(item.labelKey)}</span>
        {item.subLabelKey && <span className="block mt-0.5 text-[11px] font-normal text-sidebar-foreground/60 whitespace-normal break-words leading-tight">{t(item.subLabelKey)}</span>}
      </div>}
    </>;

    if (children.length > 0) {
      const expanded = expandedItems.includes(item.key);
      if (compact) return <Tooltip key={item.key} delayDuration={0}>
        <TooltipTrigger asChild><Button variant="sidebar" size="icon" aria-label={t(item.labelKey)} className={itemClasses}>{content}</Button></TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="flex flex-col gap-1 p-2">
          <span className="font-semibold text-xs mb-1">{t(item.labelKey)}</span>
          {children.map(child => child.href ? <NavLink key={child.key} to={child.href} onClick={handleNavigate} className="text-xs px-2 py-1 rounded hover:bg-accent">{t(child.labelKey)}</NavLink> : null)}
        </TooltipContent>
      </Tooltip>;
      return <div key={item.key}>
        <Button variant="sidebar" aria-expanded={expanded} aria-controls={`sidebar-parent-${item.key}`} onClick={() => setExpandedItems(prev => expanded ? prev.filter(key => key !== item.key) : [...prev, item.key])} className={cn(itemClasses, "w-full h-auto whitespace-normal")}>
          {content}{expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </Button>
        {expanded && <div id={`sidebar-parent-${item.key}`} className="space-y-0.5 pt-0.5">{children.map(child => renderMenuItem(child, true, depth + 1))}</div>}
      </div>;
    }
    if (!item.href) return null;
    const link = <NavLink to={item.href} onClick={handleNavigate} data-active={active} aria-label={compact ? t(item.labelKey) : undefined} className={itemClasses}>{content}</NavLink>;
    return compact ? <Tooltip key={item.key} delayDuration={0}><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right" sideOffset={8} className="font-medium">{t(item.labelKey)}</TooltipContent></Tooltip> : <React.Fragment key={item.key}>{link}</React.Fragment>;
  };

  const groups = menuItems.filter(group => group.items.some(canAccess));
  return <TooltipProvider delayDuration={0}>
    <aside className="h-full bg-sidebar flex flex-col overflow-hidden">
      <nav aria-label="Menu utama" ref={scrollContainerRef} onScroll={() => {
        if (scrollContainerRef.current) sessionStorage.setItem(SCROLL_POSITION_KEY, String(scrollContainerRef.current.scrollTop));
      }} className={cn("flex-1 overflow-y-auto py-4 sidebar-menu-scroll", compact ? "px-1.5" : "px-3")}>
        <div className="space-y-1">
          {groups.map((group, index) => {
            if (compact) return <div key={group.groupKey} className={cn(index > 0 && "pt-2")}>
              {index > 0 && <div className="mx-2 mb-2 border-t border-sidebar-border/20" />}
              <div className="space-y-0.5">{group.items.map(item => renderMenuItem(item))}</div>
            </div>;
            if (group.groupKey === "menu.summary") return <div key={group.groupKey} className="pb-4">
              <h2 className="px-3 mb-2 text-xs font-semibold uppercase text-sidebar-foreground/80">{t(group.groupKey)}</h2>
              <div className="space-y-0.5">{group.items.map(item => renderMenuItem(item))}</div>
            </div>;
            const expanded = openGroup === group.groupKey;
            const active = group.items.some(isActive);
            return <div key={group.groupKey}>
              <Button variant="sidebar" aria-expanded={expanded} aria-controls={`sidebar-${group.groupKey}`} onClick={() => setOpenGroup(prev => prev === group.groupKey ? null : group.groupKey)} className={cn("w-full h-auto justify-between gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold uppercase whitespace-normal", (active || expanded) && "text-sidebar-foreground")}>
                <span className="min-w-0 text-left break-words">{t(group.groupKey)}</span>
                {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </Button>
              <div id={`sidebar-${group.groupKey}`} hidden={!expanded}>
                <div className="space-y-0.5 pt-0.5 pb-1">{group.items.map(item => renderMenuItem(item, true))}</div>
              </div>
            </div>;
          })}
        </div>
      </nav>
      <div className="border-t border-sidebar-border/30 shrink-0">
        {!isMobile && <Button variant="sidebar" onClick={onToggleCollapse} title={compact ? "Expand sidebar" : "Collapse sidebar"} aria-label={compact ? "Expand sidebar" : "Collapse sidebar"} className={cn("w-full h-auto rounded-none px-4 py-3 text-sidebar-foreground/70", compact ? "justify-center" : "justify-start")}>
          {compact ? <PanelLeftOpen className="w-4 h-4" /> : <><PanelLeftClose className="w-4 h-4" /><span className="text-xs font-medium">Minimize</span></>}
        </Button>}
        <div className={cn("px-4 text-center", compact ? "pb-3" : "pb-3 pt-1")}>
          <p className="text-[10px] text-sidebar-foreground/60">{compact ? "KKP" : "© 2026 PT. Kemika Karya Pratama"}</p>
        </div>
      </div>
    </aside>
  </TooltipProvider>;
}
