import { createContext, useContext, useEffect, useState } from "react";
import { useGetCurrentUser, type User } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
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
      setUser(currentUser);
      localStorage.setItem("educonnect_user", JSON.stringify(currentUser));
    } else if (isError) {
      setUser(null);
      localStorage.removeItem("educonnect_user");
    }
  }, [currentUser, isError]);

  const login = (newUser: User) => {
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
