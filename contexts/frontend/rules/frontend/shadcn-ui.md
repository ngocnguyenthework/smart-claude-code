---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/components/ui/**"
---
# shadcn/ui Conventions

## Core Principles

- shadcn/ui is **not a component library** — it's copy-paste components you own
- Components live in `components/ui/` — installed via `npx shadcn@latest add`
- **Do NOT edit** files in `components/ui/` directly — extend via composition
- Built on **Radix UI** primitives + **Tailwind CSS** + **CSS variables**

## Installation and Usage

```bash
# Initialize shadcn/ui in project
npx shadcn@latest init

# Add specific components
npx shadcn@latest add button card dialog form input table
npx shadcn@latest add dropdown-menu select tabs toast

# Add all components (for full library)
npx shadcn@latest add --all
```

## Extending Components (Correct Pattern)

```tsx
// WRONG: Editing components/ui/button.tsx directly
// These get overwritten when you update shadcn/ui

// CORRECT: Compose and extend
import { Button, type ButtonProps } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface LoadingButtonProps extends ButtonProps {
  isLoading?: boolean;
}

export function LoadingButton({ isLoading, children, disabled, ...props }: LoadingButtonProps) {
  return (
    <Button disabled={isLoading || disabled} {...props}>
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}
```

## Form Pattern with React Hook Form + Zod

```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const formSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(2, "Name must be at least 2 characters"),
});

type FormValues = z.infer<typeof formSchema>;

export function UserForm({ onSubmit }: { onSubmit: (data: FormValues) => void }) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", name: "" },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="email@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          Submit
        </Button>
      </form>
    </Form>
  );
}
```

## Data Table Pattern

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Use with @tanstack/react-table for full-featured tables
import { useReactTable, getCoreRowModel, flexRender } from "@tanstack/react-table";
```

## Dialog / Modal Pattern

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

export function ConfirmDialog({ onConfirm, children }: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you sure?</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => { onConfirm(); setOpen(false); }}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

## Toast Notifications

```tsx
import { useToast } from "@/hooks/use-toast";

const { toast } = useToast();

// Success
toast({ title: "Saved", description: "Your changes have been saved." });

// Error
toast({ title: "Error", description: "Something went wrong.", variant: "destructive" });
```

## Component Catalog

Key shadcn/ui components for backend dashboards:

| Component | Use Case |
|-----------|----------|
| `Button` | Actions, form submits |
| `Card` | Content containers |
| `Table` | Data display (with @tanstack/react-table) |
| `Form` + `Input` | Data entry (with react-hook-form + zod) |
| `Dialog` | Modals, confirmations |
| `DropdownMenu` | Action menus |
| `Select` | Single selection |
| `Tabs` | Content organization |
| `Toast` | Notifications |
| `Badge` | Status indicators |
| `Skeleton` | Loading states |
| `Sheet` | Side panels |
| `Command` | Search/command palette |
