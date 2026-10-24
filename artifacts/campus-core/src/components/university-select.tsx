import { useGetDirectory, getGetDirectoryQueryKey } from "@workspace/api-client-react";
import { DirectorySelect } from "@/components/directory-select";

/** Lists active universities from the directory. value "" means none. */
export function UniversitySelect({ value, onChange, allowAll, testId = "select-university", placeholder = "Choose a university" }: {
  value: string; onChange: (v: string) => void; allowAll?: boolean; testId?: string; placeholder?: string;
}) {
  const params = { kind: "university" as const };
  const { data, isLoading, error } = useGetDirectory(params, { query: { queryKey: getGetDirectoryQueryKey(params), staleTime: 5 * 60_000 } });
  const list = (data ?? []).filter((d) => d.active);
  return (
    <div className="min-w-0">
      <DirectorySelect entries={list} value={value ? Number(value) : null} onChange={id => onChange(id ? String(id) : "")}
        label="University" testId={testId} allowEmpty={allowAll} emptyLabel="All universities"
        disabled={isLoading} placeholder={isLoading ? "Loading universities" : placeholder} />
      {error && <p role="alert" className="mt-1 text-xs text-destructive">Universities could not be loaded. Please refresh to try again.</p>}
    </div>
  );
}
