import { cn } from "@/lib/utils";

export default function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-base tabular-nums placeholder:text-muted-foreground disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}
