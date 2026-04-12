import { createContext, useContext, useEffect, useState } from "react";
import { useGetCurrentUser } from "@workspace/api-client-react";
import type { AuthUser } from "@/types/auth";

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem("educonnect_user");
    return saved ? JSON.parse(saved) : null;
  });
  
  const { data: currentUser, isLoading, isError } = useGetCurrentUser({
    query: {
      retry: false,
    }
  });

  useEffect(() => {
    if (currentUser) {
      const nextUser = currentUser as AuthUser;
      setUser(nextUser);
      localStorage.setItem("educonnect_user", JSON.stringify(nextUser));
    } else if (isError) {
      setUser(null);
      localStorage.removeItem("educonnect_user");
    }
  }, [currentUser, isError]);

  const login = (newUser: AuthUser) => {
    setUser(newUser);
    localStorage.setItem("educonnect_user", JSON.stringify(newUser));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("educonnect_user");
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
