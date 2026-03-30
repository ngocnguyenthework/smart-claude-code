---
name: coding-standards
description: Universal coding standards for TypeScript, JavaScript, React, and Node.js — naming, immutability, error handling, async patterns, type safety.
origin: smartclaude
---

# Coding Standards & Best Practices

## Core Principles

- **Readability first** — code is read more than written
- **KISS** — simplest solution that works
- **DRY** — extract common logic into functions
- **YAGNI** — don't build features before they're needed

## Naming

```typescript
// ✅ GOOD
const marketSearchQuery = 'election'
const isUserAuthenticated = true
async function fetchMarketData(marketId: string) {}
function isValidEmail(email: string): boolean {}

// ❌ BAD
const q = 'election'
const flag = true
async function market(id: string) {}
```

## Immutability (CRITICAL)

```typescript
// ✅ ALWAYS spread
const updatedUser = { ...user, name: 'New Name' }
const updatedArray = [...items, newItem]

// ❌ NEVER mutate directly
user.name = 'New Name'
items.push(newItem)
```

## Error Handling

```typescript
// ✅ GOOD
async function fetchData(url: string) {
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (error) {
    console.error('Fetch failed:', error)
    throw new Error('Failed to fetch data')
  }
}
```

## Async — Parallel When Possible

```typescript
// ✅ Parallel
const [users, markets] = await Promise.all([fetchUsers(), fetchMarkets()])

// ❌ Sequential (when unnecessary)
const users = await fetchUsers()
const markets = await fetchMarkets()
```

## Type Safety

```typescript
// ✅ Proper types
interface Market { id: string; status: 'active' | 'resolved' | 'closed' }
function getMarket(id: string): Promise<Market> {}

// ❌ Avoid any
function getMarket(id: any): Promise<any> {}
```

## Code Smells to Fix

```typescript
// Long functions (>50 lines) — split into smaller functions
// Deep nesting (>4 levels) — use early returns
if (!user) return
if (!user.isAdmin) return
// Do something

// Magic numbers — use named constants
const MAX_RETRIES = 3
const DEBOUNCE_DELAY_MS = 500
```

## Testing (AAA Pattern)

```typescript
test('calculates similarity correctly', () => {
  // Arrange
  const vector1 = [1, 0, 0]
  // Act
  const result = calculateSimilarity(vector1, [0, 1, 0])
  // Assert
  expect(result).toBe(0)
})
```

Test names: `'returns empty array when no markets match query'` not `'works'`.
