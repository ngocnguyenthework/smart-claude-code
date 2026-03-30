---
name: frontend-patterns
description: Frontend patterns — component composition, custom hooks (state/async/debounce), Context+Reducer state management, memoization, code splitting, virtualization, error boundaries, accessibility.
origin: smartclaude
---

# Frontend Patterns

## Component Composition

```tsx
// Compound component pattern
function Select({ children, value, onChange }) {
  return <SelectContext.Provider value={{ value, onChange }}>{children}</SelectContext.Provider>
}
Select.Option = function Option({ value, children }) {
  const { onChange } = useContext(SelectContext)
  return <div onClick={() => onChange(value)}>{children}</div>
}

// Usage
<Select value={selected} onChange={setSelected}>
  <Select.Option value="a">Option A</Select.Option>
  <Select.Option value="b">Option B</Select.Option>
</Select>
```

## Custom Hooks

```typescript
// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debounced
}

// Async data fetching hook
function useAsync<T>(fn: () => Promise<T>, deps: any[]) {
  const [state, setState] = useState<{ data?: T; loading: boolean; error?: Error }>({ loading: true })
  useEffect(() => {
    setState({ loading: true })
    fn().then(data => setState({ data, loading: false }))
       .catch(error => setState({ error, loading: false }))
  }, deps)
  return state
}
```

## State Management — Context + Reducer

```typescript
// For complex shared state
const AppContext = createContext<{ state: AppState; dispatch: Dispatch<Action> } | null>(null)

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_USER': return { ...state, user: action.payload }
    case 'LOGOUT': return { ...state, user: null }
    default: return state
  }
}

function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>
}
```

## Memoization

```tsx
// Memoize expensive computations
const sortedItems = useMemo(
  () => [...items].sort((a, b) => a.name.localeCompare(b.name)),
  [items]
)

// Memoize callbacks
const handleClick = useCallback(() => doSomething(id), [id])

// Memoize component
const ExpensiveList = React.memo(({ items }) => (
  <ul>{items.map(item => <li key={item.id}>{item.name}</li>)}</ul>
))
```

## Code Splitting

```tsx
// Route-level splitting
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Settings = lazy(() => import('./pages/Settings'))

function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  )
}
```

## Virtualization (Long Lists)

```tsx
import { FixedSizeList } from 'react-window'

function VirtualList({ items }) {
  return (
    <FixedSizeList height={600} itemCount={items.length} itemSize={50} width="100%">
      {({ index, style }) => (
        <div style={style}>{items[index].name}</div>
      )}
    </FixedSizeList>
  )
}
```

## Error Boundaries

```tsx
class ErrorBoundary extends React.Component {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error, info) { reportError(error, info) }
  render() {
    if (this.state.hasError) return <ErrorFallback />
    return this.props.children
  }
}
```

## Accessibility Checklist

- [ ] All interactive elements keyboard-navigable
- [ ] Focus management on modal open/close
- [ ] `aria-label` on icon-only buttons
- [ ] `role` and `aria-*` on custom widgets
- [ ] Color contrast ratio ≥ 4.5:1
- [ ] Images have descriptive `alt` text
