import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";

/** Searchable, scrollable selector for database-backed reference records. */
export function DirectorySelect({
  entries,
  value,
  onChange,
  placeholder,
  disabled,
  allowEmpty,
  emptyLabel = "Not set",
  testId,
  label,
}: {
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
  const selected = entries.find((e) => e.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          disabled={disabled}
          data-testid={testId}
          className="w-full justify-between text-left font-normal"
        >
          <span className="truncate">{selected?.name ?? (allowEmpty && !value ? emptyLabel : placeholder)}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[80] w-[var(--radix-popover-trigger-width)] min-w-[min(100vw-2rem,20rem)] max-w-[calc(100vw-1rem)] p-0"
        align="start"
        sideOffset={4}
        collisionPadding={16}
        onOpenAutoFocus={(e) => {
          // Focus search input for keyboard and mobile
          const input = (e.currentTarget as HTMLElement)?.querySelector("input");
          if (input instanceof HTMLElement) {
            e.preventDefault();
            input.focus();
          }
        }}
      >
        <Command shouldFilter>
          <CommandInput placeholder={`Search ${label.toLowerCase()}…`} aria-label={`Search ${label.toLowerCase()}`} />
          <CommandList className="max-h-[min(320px,50vh)] overscroll-contain overflow-y-auto">
            <CommandEmpty>No matching entries. Request a missing entry if needed.</CommandEmpty>
            <CommandGroup>
              {allowEmpty && (
                <CommandItem
                  value={`none ${emptyLabel}`}
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  {emptyLabel}
                </CommandItem>
              )}
              {entries.map((entry) => (
                <CommandItem
                  key={entry.id}
                  value={`${entry.name} ${entry.id}`}
                  onSelect={() => {
                    onChange(entry.id);
                    setOpen(false);
                  }}
                >
                  <Check className={`mr-2 h-4 w-4 shrink-0 ${entry.id === value ? "opacity-100" : "opacity-0"}`} />
                  <span className="break-words text-left">{entry.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
