"use client";

import { useSession } from "next-auth/react";

export function useOrganization() {
  const { data: session, status } = useSession();

  const organizationId = session?.user?.organizationId;
  const organizationName = session?.user?.organizationName;
  const branchId = session?.user?.branchId;
  const branchName = session?.user?.branchName;
  const role = session?.user?.role;
  const permissions = session?.user?.permissions;

  const isLoading = status === "loading";
  const isAuthenticated = status === "authenticated" && !!organizationId;

  return {
    organizationId,
    organizationName,
    branchId,
    branchName,
    role,
    permissions,
    isLoading,
    isAuthenticated,
    session,
  };
}

// API helper that automatically includes organization ID
export function useApi() {
  const { organizationId } = useOrganization();

  const apiUrl = (path: string) => {
    if (!organizationId) return null;
    return `/api/organizations/${organizationId}${path.startsWith("/") ? path : `/${path}`}`;
  };

  const fetchApi = async <T>(
    path: string,
    options?: RequestInit
  ): Promise<T> => {
    const url = apiUrl(path);
    if (!url) {
      throw new Error("Organization not loaded");
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `API Error: ${response.status}`);
    }

    return response.json();
  };

  return {
    apiUrl,
    fetchApi,
    organizationId,
  };
}
