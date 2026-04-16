---
paths:
  - "**/*.test.tsx"
  - "**/*.test.ts"
  - "**/*.spec.tsx"
  - "**/*.spec.ts"
  - "**/*.tsx"
  - "**/*.jsx"
---
# Frontend Testing

> Extends [common/testing.md](../common/testing.md) with React/Next.js-specific testing patterns.

## Test Stack

- **Unit/Integration**: Vitest + React Testing Library
- **E2E**: Playwright
- **Coverage target**: 80%+

## Unit Testing Components

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { UserCard } from "./user-card";

describe("UserCard", () => {
  const mockUser = { id: "1", name: "John Doe", email: "john@example.com" };

  it("renders user info", () => {
    render(<UserCard user={mockUser} />);
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("john@example.com")).toBeInTheDocument();
  });

  it("calls onEdit when edit button clicked", async () => {
    const onEdit = vi.fn();
    render(<UserCard user={mockUser} onEdit={onEdit} />);
    await fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledWith("1");
  });
});
```

## Testing Hooks

```tsx
import { renderHook, act } from "@testing-library/react";
import { useDebounce } from "./use-debounce";

describe("useDebounce", () => {
  it("debounces value changes", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: "initial" } }
    );

    expect(result.current).toBe("initial");

    rerender({ value: "updated" });
    expect(result.current).toBe("initial"); // Not yet updated

    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe("updated"); // Now updated
  });
});
```

## Testing Forms with shadcn/ui

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

describe("UserForm", () => {
  it("validates required fields", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<UserForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/email.*required/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits valid form data", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<UserForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/email/i), "test@example.com");
    await user.type(screen.getByLabelText(/name/i), "Test User");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        email: "test@example.com",
        name: "Test User",
      });
    });
  });
});
```

## E2E Testing with Playwright

```tsx
// e2e/dashboard.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("/dashboard");
  });

  test("displays user list", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("creates new user", async ({ page }) => {
    await page.click("text=Add User");
    await page.fill('[name="name"]', "New User");
    await page.fill('[name="email"]', "new@example.com");
    await page.click('button[type="submit"]');
    await expect(page.getByText("New User")).toBeVisible();
  });
});
```

## What to Test

| Layer | Test Type | What to Verify |
|-------|-----------|----------------|
| Components | Unit | Renders correctly, handles props, events |
| Hooks | Unit | State changes, side effects, edge cases |
| Forms | Integration | Validation, submission, error display |
| Pages | E2E | User flows, navigation, data loading |
| API Routes | Integration | Status codes, response shape, auth |
| Server Actions | Integration | Validation, mutation, revalidation |

## Running Tests

```bash
# Unit/integration tests
npx vitest
npx vitest --coverage

# E2E tests
npx playwright test
npx playwright test --ui  # Visual mode

# Specific test file
npx vitest src/components/user-card.test.tsx
```
