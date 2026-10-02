import { useState } from "react";
import ProfileSettings from "@/components/settings/ProfileSettings";
import SystemSettings from "@/components/settings/SystemSettings";
import UserManagementSettings from "@/components/settings/UserManagementSettings";
import SecuritySettings from "@/components/settings/SecuritySettings";
import ReceiptSettings from "@/components/settings/ReceiptSettings";
import {
  AppearancePanel, LayoutPanel, ModulesPanel, RolesPanel, RulesPanel,
} from "@/components/settings/AdminControlPanels";
import {
  User, Settings as SettingsIcon, Users, Shield, Receipt, Palette, LayoutTemplate,
  Boxes, KeyRound, SlidersHorizontal,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { key: "profile", label: "My Profile", icon: User, group: "Account", admin: false, el: <ProfileSettings /> },
  { key: "security", label: "Security", icon: Shield, group: "Account", admin: false, el: <SecuritySettings /> },
  { key: "system", label: "General", icon: SettingsIcon, group: "Business", admin: true, el: <SystemSettings /> },
  { key: "appearance", label: "Branding & Design", icon: Palette, group: "Business", admin: true, el: <AppearancePanel /> },
  { key: "layout", label: "Menu Layout", icon: LayoutTemplate, group: "Business", admin: true, el: <LayoutPanel /> },
  { key: "receipt", label: "Receipt", icon: Receipt, group: "Business", admin: true, el: <ReceiptSettings /> },
  { key: "modules", label: "Modules", icon: Boxes, group: "Control", admin: true, el: <ModulesPanel /> },
  { key: "rules", label: "Module Rules", icon: SlidersHorizontal, group: "Control", admin: true, el: <RulesPanel /> },
  { key: "roles", label: "Roles & Permissions", icon: KeyRound, group: "Control", admin: true, el: <RolesPanel /> },
  { key: "users", label: "Users", icon: Users, group: "Control", admin: true, el: <UserManagementSettings /> },
];

export default function Settings() {
  const { isAdmin, isOwner } = usePermissions();
  const canAdmin = isAdmin || isOwner;
  const visible = SECTIONS.filter((s) => !s.admin || canAdmin);
  const [active, setActive] = useState(canAdmin ? "system" : "profile");
  const current = visible.find((s) => s.key === active) || visible[0];
  const groups = [...new Set(visible.map((s) => s.group))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Control Center</h1>
        <p className="text-muted-foreground">Manage your business, design, modules and who can access what</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="lg:w-60 lg:shrink-0">
          <nav className="flex gap-1 overflow-x-auto rounded-lg border bg-card p-2 lg:sticky lg:top-4 lg:flex-col">
            {groups.map((g) => (
              <div key={g} className="flex gap-1 lg:flex-col">
                <p className="hidden px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:block">{g}</p>
                {visible.filter((s) => s.group === g).map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setActive(s.key)}
                    className={cn(
                      "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      current.key === s.key ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                    )}
                  >
                    <s.icon className="h-4 w-4" /> {s.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>
        <section className="min-w-0 flex-1">{current.el}</section>
      </div>
    </div>
  );
}
