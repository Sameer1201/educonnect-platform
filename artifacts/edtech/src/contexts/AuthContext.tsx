import { createContext, useContext, useEffect, useState } from "react";
import { useGetCurrentUser } from "@workspace/api-client-react";
import type { AuthUser } from "@/types/auth";
import { clearFirebaseGoogleSession } from "@/lib/firebase";

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function isActivePlatformRole(user: AuthUser | null): user is AuthUser {
  return !!user && user.role !== "planner";
}

function readStoredUser() {
  const saved = localStorage.getItem("educonnect_user");
  if (!saved) return null;

  try {
    const parsed = JSON.parse(saved) as AuthUser;
    return isActivePlatformRole(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());
  
  const { data: currentUser, isLoading, isError } = useGetCurrentUser({
    query: {
      queryKey: ["auth", "me"],
      retry: false,
    }
  });

  useEffect(() => {
    if (currentUser) {
      const nextUser = currentUser as AuthUser;
      if (isActivePlatformRole(nextUser)) {
        setUser(nextUser);
        localStorage.setItem("educonnect_user", JSON.stringify(nextUser));
      } else {
        setUser(null);
        localStorage.removeItem("educonnect_user");
      }
    } else if (isError) {
      setUser(null);
      localStorage.removeItem("educonnect_user");
    }
  }, [currentUser, isError]);

  const login = (newUser: AuthUser) => {
    if (!isActivePlatformRole(newUser)) {
      setUser(null);
      localStorage.removeItem("educonnect_user");
      return;
    }
    setUser(newUser);
    localStorage.setItem("educonnect_user", JSON.stringify(newUser));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("educonnect_user");
    void clearFirebaseGoogleSession();
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
