import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Bell,
  Boxes,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Download,
  FileText,
  KeyRound,
  LayoutDashboard,
  Link2,
  MapPin,
  MoreHorizontal,
  Package,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Stethoscope,
  Store,
  Tag,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Warehouse,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Icônes de navigation — une seule table partagée par le web et la Mini App,
 * indexée sur le nom déclaré dans `navigation.config.ts`.
 */
export const NAV_ICONS: Record<string, LucideIcon> = {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Bell,
  Boxes,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Download,
  FileText,
  KeyRound,
  LayoutDashboard,
  Link2,
  MapPin,
  MoreHorizontal,
  Package,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Stethoscope,
  Store,
  Tag,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Warehouse,
  Wallet,
};

export function navIcon(name: string): LucideIcon {
  return NAV_ICONS[name] ?? LayoutDashboard;
}

/** Chemin de base d'une entrée (sans ancre), pour repérer la page active. */
export function basePath(href: string): string {
  const index = href.indexOf("#");
  return index === -1 ? href : href.slice(0, index);
}
