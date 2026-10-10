import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { mockUsers, type MockUserProfile } from '@/data/mockData';

export type UserRole = 'participant' | 'host' | 'jury' | 'admin';

export type AuthContextType = {
  user: MockUserProfile | null;
  role: UserRole;
  isAuthenticated: boolean;
  login: (email: string, password?: string) => Promise<boolean>;
  signup: (fullName: string, email: string, role: string) => Promise<boolean>;
  logout: () => void;
  switchRole: (newRole: UserRole) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY_USER = 'waymark_user';
const STORAGE_KEY_ROLE = 'waymark_role';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MockUserProfile | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_USER);
    if (saved) {
      try { return JSON.parse(saved); } catch { return mockUsers[0]; }
    }
    return mockUsers[0]; // Default demo user: Maya Chen
  });

  const [role, setRole] = useState<UserRole>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ROLE) as UserRole;
    return saved || 'participant';
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY_USER);
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ROLE, role);
  }, [role]);

  const login = async (email: string): Promise<boolean> => {
    const matched = mockUsers.find((u) => u.email.toLowerCase() === email.toLowerCase()) || {
      id: `usr-${Date.now()}`,
      name: email.split('@')[0],
      email: email,
      role: 'Participant' as const,
      status: 'Active' as const,
      eventsCount: 0,
      joinedDate: 'Just now',
    };
    setUser(matched);
    const mappedRole: UserRole = matched.role === 'Host' ? 'host' : matched.role === 'Jury' ? 'jury' : matched.role === 'Administrator' ? 'admin' : 'participant';
    setRole(mappedRole);
    return true;
  };

  const signup = async (fullName: string, email: string, selectedRole: string): Promise<boolean> => {
    const mappedRole: UserRole = selectedRole === 'host' ? 'host' : selectedRole === 'jury' ? 'jury' : selectedRole === 'admin' ? 'admin' : 'participant';
    const newUser: MockUserProfile = {
      id: `usr-${Date.now()}`,
      name: fullName,
      email: email,
      role: selectedRole === 'host' ? 'Host' : selectedRole === 'jury' ? 'Jury' : selectedRole === 'admin' ? 'Administrator' : 'Participant',
      status: 'Active',
      eventsCount: 0,
      joinedDate: 'Just now',
    };
    setUser(newUser);
    setRole(mappedRole);
    return true;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_ROLE);
  };

  const switchRole = (newRole: UserRole) => {
    setRole(newRole);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAuthenticated: Boolean(user),
        login,
        signup,
        logout,
        switchRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
