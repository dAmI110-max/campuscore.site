import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";

/** Searchable, keyboard-accessible selector for database-backed reference records. */
export function DirectorySelect({ entries, value, onChange, placeholder, disabled, allowEmpty, emptyLabel = "Not set", testId, label }: {
  entries: { id: number; name: string }[];
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  testId: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = entries.find(e => e.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} aria-label={label}
          disabled={disabled} data-testid={testId} className="w-full justify-between text-left font-normal">
          <span className="truncate">{selected?.name ?? (allowEmpty && !value ? emptyLabel : placeholder)}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-0 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}…`} aria-label={`Search ${label.toLowerCase()}`} />
          <CommandList>
            <CommandEmpty>No matching entries. Request a missing entry below the selector.</CommandEmpty>
            <CommandGroup>
              {allowEmpty && <CommandItem value={`none ${emptyLabel}`} onSelect={() => { onChange(null); setOpen(false); }}>{emptyLabel}</CommandItem>}
              {entries.map(entry => <CommandItem key={entry.id} value={`${entry.name} ${entry.id}`} onSelect={() => { onChange(entry.id); setOpen(false); }}>
                <Check className={`mr-2 h-4 w-4 shrink-0 ${entry.id === value ? "opacity-100" : "opacity-0"}`} />
                <span className="break-words">{entry.name}</span>
              </CommandItem>)}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
