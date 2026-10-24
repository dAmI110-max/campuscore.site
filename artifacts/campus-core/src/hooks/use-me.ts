import { useAuth } from "@clerk/react";
import { useGetProfile, getGetProfileQueryKey } from "@workspace/api-client-react";

export function useMe() {
  const { isLoaded, isSignedIn } = useAuth();
  const q = useGetProfile({ query: { enabled: !!isSignedIn, queryKey: getGetProfileQueryKey(), retry: 1 } });
  return {
    authLoaded: isLoaded,
    signedIn: !!isSignedIn,
    profile: isSignedIn ? q.data : undefined,
    loading: !isLoaded || (!!isSignedIn && q.isLoading),
    error: q.error,
    refetch: q.refetch,
  };
}
