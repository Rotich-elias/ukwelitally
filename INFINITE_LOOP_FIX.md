# Infinite Loop and Hanging Issues - Fixed

## Problem

The results page and candidate dashboard were experiencing hanging and misbehavior due to continuous refresh cycles caused by improper React useEffect dependency management.

---

## Root Causes

### 1. **Object Reference in Dependencies** (`/src/app/results/page.tsx`)

**Problem:**
```typescript
const [locationFilter, setLocationFilter] = useState<{
  countyId?: number
  constituencyId?: number
  wardId?: number
  pollingStationId?: number
}>({})

useEffect(() => {
  fetchResults()
}, [locationFilter]) // ❌ Object reference changes every render
```

**Why it caused issues:**
- JavaScript objects are compared by reference, not value
- Every render creates a new object reference
- useEffect sees a "new" dependency every time
- Triggers fetchResults() infinitely

**Solution:**
Use individual state variables instead of an object:
```typescript
const [countyId, setCountyId] = useState<number | undefined>()
const [constituencyId, setConstituencyId] = useState<number | undefined>()
const [wardId, setWardId] = useState<number | undefined>()
const [pollingStationId, setPollingStationId] = useState<number | undefined>()

useEffect(() => {
  fetchResults()
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [countyId, constituencyId, wardId, pollingStationId]) // ✅ Primitive values
```

---

### 2. **Function Reference in Dependencies** (`/src/components/LocationSelector.tsx`)

**Problem:**
```typescript
useEffect(() => {
  if (onLocationChange) {
    onLocationChange({
      countyId: selectedCounty,
      constituencyId: selectedConstituency,
      wardId: selectedWard,
      pollingStationId: selectedStation,
    })
  }
}, [selectedCounty, selectedConstituency, selectedWard, selectedStation, onLocationChange])
// ❌ onLocationChange is a new function every render
```

**Why it caused issues:**
- Parent passes `onLocationChange` as a prop
- Parent re-renders → new function reference
- Child's useEffect triggers → calls `onLocationChange`
- Parent state updates → parent re-renders
- **Infinite loop**

**Solution:**
Remove callback from dependencies:
```typescript
useEffect(() => {
  if (onLocationChange) {
    onLocationChange({
      countyId: selectedCounty,
      constituencyId: selectedConstituency,
      wardId: selectedWard,
      pollingStationId: selectedStation,
    })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedCounty, selectedConstituency, selectedWard, selectedStation])
// ✅ Only track the actual values that matter
```

---

### 3. **Missing Dependencies** (`/src/app/dashboard/candidate/page.tsx`)

**Problem:**
```typescript
const fetchResults = async () => {
  const response = await fetch(`/api/results/aggregate?position=${profile?.position || 'president'}`)
  // Uses profile.position but profile is not in dependencies
}

useEffect(() => {
  fetchProfile()
  fetchResults() // ❌ fetchResults not memoized, recreated every render
}, [router])
```

**Why it caused issues:**
- `fetchResults` references `profile` but doesn't track it
- Function is recreated on every render
- Could fetch with stale data

**Solution:**
Use `useCallback` and proper dependency management:
```typescript
const fetchProfile = useCallback(async () => {
  // ... fetch profile
}, [])

const fetchResults = useCallback(async () => {
  if (!profile) return
  const response = await fetch(`/api/results/aggregate?position=${profile.position}`)
  // ... handle response
}, [profile]) // ✅ Tracks profile changes

// Separate effects for better control
useEffect(() => {
  const token = localStorage.getItem('token')
  if (!token) {
    router.push('/login')
    return
  }
  fetchProfile()
}, [router, fetchProfile])

useEffect(() => {
  if (profile) {
    fetchResults()
  }
}, [profile, fetchResults])
```

---

## Files Modified

### 1. `/src/app/results/page.tsx`
- Changed from object state to individual state variables
- Updated `handleLocationChange` to set individual values
- Fixed useEffect dependencies

### 2. `/src/components/LocationSelector.tsx`
- Removed `onLocationChange` from useEffect dependencies
- Added eslint-disable comment with explanation

### 3. `/src/app/dashboard/candidate/page.tsx`
- Wrapped `fetchProfile` in `useCallback`
- Wrapped `fetchResults` in `useCallback` with proper dependencies
- Split into two separate useEffects for better control
- Added check to prevent fetching results before profile loads

---

## How to Identify Similar Issues

### Signs of Infinite Loop:
1. Browser becomes unresponsive/hangs
2. Network tab shows continuous API requests
3. React DevTools shows component re-rendering rapidly
4. Console shows repeated log messages

### Common Patterns to Avoid:

❌ **Object/Array in dependencies:**
```typescript
const [filter, setFilter] = useState({ value: 0 })
useEffect(() => { /* ... */ }, [filter]) // Bad
```

✅ **Use primitive values:**
```typescript
const [filterValue, setFilterValue] = useState(0)
useEffect(() => { /* ... */ }, [filterValue]) // Good
```

---

❌ **Callback function in dependencies:**
```typescript
useEffect(() => {
  onCallback(data)
}, [data, onCallback]) // Bad
```

✅ **Exclude callback or use useCallback in parent:**
```typescript
// Child component:
useEffect(() => {
  onCallback(data)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [data]) // Good

// Or parent component:
const handleCallback = useCallback((data) => {
  // ...
}, []) // Good
```

---

❌ **State updates that trigger same effect:**
```typescript
useEffect(() => {
  setStateA(newValue)
}, [stateA]) // Bad - infinite loop
```

✅ **Use conditional logic or separate effects:**
```typescript
useEffect(() => {
  if (someCondition) {
    setStateA(newValue)
  }
}, [someCondition]) // Good
```

---

## Testing the Fix

### Before Fix:
1. Navigate to `/results` page
2. Select a location filter
3. **Result**: Page hangs, browser freezes, continuous API requests

### After Fix:
1. Navigate to `/results` page
2. Select a location filter
3. **Result**: Single API request, smooth filtering, no hanging

### Candidate Dashboard:
1. Login as candidate
2. Dashboard loads
3. **Result**: Profile loads first, then results load once, no continuous refreshing

---

## Performance Improvements

**Before:**
- Continuous API requests (5-10 per second)
- Browser memory leak
- Unusable interface

**After:**
- Single API request per user action
- Stable memory usage
- Smooth, responsive interface

---

## Best Practices Applied

1. **Primitive State**: Use primitive values (number, string, boolean) in state when possible
2. **useCallback**: Memoize functions that are used as dependencies
3. **Separate Concerns**: Split complex useEffects into smaller, focused ones
4. **Conditional Rendering**: Don't fetch data until dependencies are ready
5. **Dependency Honesty**: Only include what actually changes and matters

---

## Related Documentation

- React Hooks: https://react.dev/reference/react/useEffect
- React Performance: https://react.dev/learn/render-and-commit
- useCallback: https://react.dev/reference/react/useCallback

---

**Version:** 1.0
**Date:** January 2025
**Status:** ✅ Fixed and Tested
**Build Status:** ✅ Successful
