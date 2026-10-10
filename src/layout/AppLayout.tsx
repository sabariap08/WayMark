import { useState } from 'react';
import {
  Activity,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Scale,
  Settings2,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  UserRound,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { eventTypes } from '@/data/events';
import type { ViewKey } from '@/types';

import { useAuth } from '@/context/AuthContext';

type RoleKey = 'participant' | 'host' | 'jury' | 'admin';

const rolesConfig: Record<RoleKey, { label: string; avatar: string; color: string }> = {
  participant: { label: 'Personal workspace', avatar: 'MC', color: 'avatar-cream' },
  host: { label: 'Host workspace', avatar: 'MC', color: 'avatar-terracotta' },
  jury: { label: 'Jury workspace', avatar: 'SL', color: 'avatar-blue' },
  admin: { label: 'Admin workspace', avatar: 'JL', color: 'avatar-green' },
};

const menuGroups = [
  {
    label: 'Workspace',
    roles: ['participant', 'host', 'jury', 'admin'],
    items: [
      { key: 'overview' as ViewKey, label: 'Overview', icon: LayoutDashboard, path: '/', roles: ['participant', 'host', 'jury', 'admin'] },
      { key: 'discover' as ViewKey, label: 'Discover events', icon: CalendarDays, path: '/discover', roles: ['participant', 'host', 'admin'] },
      { key: 'registrations' as ViewKey, label: 'My registrations', icon: TicketCheck, path: '/registrations', roles: ['participant'] },
      { key: 'events' as ViewKey, label: 'My events', icon: ClipboardList, path: '/events', roles: ['host', 'admin'] },
    ],
  },
  {
    label: 'Workflows & Forms',
    roles: ['participant', 'host', 'jury', 'admin'],
    items: [
      { key: 'forms' as ViewKey, label: 'All forms & workflows', icon: LayoutDashboard, path: '/forms', roles: ['participant', 'host', 'jury', 'admin'] },
      { key: 'host-form' as ViewKey, label: 'Create event', icon: Plus, path: '/forms/host-event', roles: ['host', 'admin'] },
      { key: 'jury-scoring' as ViewKey, label: 'Jury evaluation', icon: Scale, path: '/forms/scoring', roles: ['jury', 'host', 'admin'] },
      { key: 'attendance' as ViewKey, label: 'Attendance check-in', icon: ClipboardList, path: '/forms/attendance', roles: ['host', 'admin'] },
    ],
  },
  {
    label: 'Account',
    roles: ['participant', 'host', 'jury', 'admin'],
    items: [
      { key: 'notifications' as ViewKey, label: 'Notifications', icon: Bell, count: 3, path: '/notifications', roles: ['participant', 'host', 'jury', 'admin'] },
      { key: 'profile' as ViewKey, label: 'Profile', icon: UserRound, path: '/profile', roles: ['participant', 'host', 'jury', 'admin'] },
    ],
  },
  {
    label: 'Administration',
    roles: ['admin', 'host'],
    items: [
      { key: 'approvals' as ViewKey, label: 'Approval queue', icon: ShieldCheck, count: 8, path: '/approvals', roles: ['admin'] },
      { key: 'users' as ViewKey, label: 'Users', icon: Users, path: '/users', roles: ['admin'] },
      { key: 'audit' as ViewKey, label: 'Activity & audit', icon: Activity, path: '/audit', roles: ['admin', 'host'] },
    ],
  },
];

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role: currentRole, switchRole, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  const activeItem = menuGroups.flatMap((group) => group.items).find((item) => item.path === location.pathname);
  const closeMobile = () => setSidebarOpen(false);

  const filteredMenuGroups = menuGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.roles.includes(currentRole)),
    }))
    .filter((group) => group.items.length > 0);

  const roleInfo = rolesConfig[currentRole as RoleKey] || rolesConfig.participant;
  const userInitials = user?.name ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2) : 'MC';

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>
          <span>waymark</span>
        </div>

        {/* Workspace Role Switcher */}
        <div className="workspace-switcher-wrap">
          <button className="workspace-switcher" onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}>
            <div className={`avatar ${roleInfo.color}`}>{userInitials}</div>
            <div>
              <strong>{user?.name || 'Maya Chen'}</strong>
              <span>{roleInfo.label}</span>
            </div>
            <ChevronDown size={16} />
          </button>
          {roleDropdownOpen && (
            <div className="role-dropdown-menu">
              <div className="dropdown-label">Switch Workspace Role</div>
              <button
                className={`role-option ${currentRole === 'participant' ? 'active-role' : ''}`}
                onClick={() => {
                  switchRole('participant');
                  setRoleDropdownOpen(false);
                }}
              >
                <UserRound size={15} /> Personal Workspace
              </button>
              <button
                className={`role-option ${currentRole === 'host' ? 'active-role' : ''}`}
                onClick={() => {
                  switchRole('host');
                  setRoleDropdownOpen(false);
                }}
              >
                <ClipboardList size={15} /> Host Workspace
              </button>
              <button
                className={`role-option ${currentRole === 'jury' ? 'active-role' : ''}`}
                onClick={() => {
                  switchRole('jury');
                  setRoleDropdownOpen(false);
                }}
              >
                <Scale size={15} /> Jury Workspace
              </button>
              <button
                className={`role-option ${currentRole === 'admin' ? 'active-role' : ''}`}
                onClick={() => {
                  switchRole('admin');
                  setRoleDropdownOpen(false);
                }}
              >
                <ShieldCheck size={15} /> Admin Workspace
              </button>
            </div>
          )}
        </div>

        <nav className="side-nav">
          {filteredMenuGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-label">{group.label}</span>
              {group.items.map(({ key, label, icon: Icon, count, path }) => (
                <Link
                  key={key}
                  to={path}
                  className={`nav-item ${location.pathname === path ? 'nav-active' : ''}`}
                  onClick={closeMobile}
                >
                  <Icon size={18} strokeWidth={location.pathname === path ? 2.4 : 1.8} />
                  <span>{label}</span>
                  {count && <em>{count}</em>}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-symbol">
              <Sparkles size={16} />
            </div>
            <strong>Make your mark</strong>
            <span>Host events that bring people together.</span>
            <button onClick={() => setCreateOpen(true)}>
              Create an event <ChevronRight size={14} />
            </button>
          </div>
          <button className="nav-item" onClick={() => navigate('/forms/profile')}>
            <Settings2 size={18} />
            <span>Settings</span>
          </button>
          <button className="nav-item" onClick={() => { logout(); navigate('/login'); }}>
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {sidebarOpen && <button className="mobile-scrim" onClick={closeMobile} aria-label="Close navigation" />}

      <main className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
              <Menu size={21} />
            </button>
            <div className="breadcrumb">
              <span>{roleInfo.label}</span>
              <ChevronRight size={14} />
              <strong>{activeItem?.label ?? 'Overview'}</strong>
            </div>
          </div>
          <div className="topbar-actions">
            <Link className="icon-button notification-button" to="/notifications" aria-label="Open notifications">
              <Bell size={19} />
              <span />
            </Link>
            <div className="topbar-user" onClick={() => navigate('/forms/profile')}>
              <div className={`avatar ${roleInfo.color}`}>{roleInfo.avatar}</div>
              <ChevronDown size={15} />
            </div>
          </div>
        </header>

        <div className="page-container">
          <Outlet />
        </div>
      </main>

      {createOpen && <CreateEventModal onClose={() => setCreateOpen(false)} navigate={navigate} />}
    </div>
  );
}

function CreateEventModal({ onClose, navigate }: { onClose: () => void; navigate: (path: string) => void }) {
  const handleSelectType = () => {
    onClose();
    navigate('/forms/host-event');
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-event-title">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <X size={19} />
        </button>
        <div className="modal-icon">
          <Plus size={21} />
        </div>
        <div className="eyebrow">Start something new</div>
        <h2 id="create-event-title">Create an event</h2>
        <p>Choose a format to begin. You can save a draft and return to it anytime.</p>
        <div className="event-type-grid">
          {eventTypes.map(([title, description, iconClass], index) => (
            <button key={title} onClick={handleSelectType}>
              <span className={`type-icon ${iconClass}`}>
                {index === 0 ? <Zap size={18} /> : index === 1 ? <Users size={18} /> : index === 2 ? <CalendarDays size={18} /> : <Sparkles size={18} />}
              </span>
              <strong>{title}</strong>
              <small>{description}</small>
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSelectType}>
            Continue <ChevronRight size={16} />
          </Button>
        </div>
      </section>
    </div>
  );
}

