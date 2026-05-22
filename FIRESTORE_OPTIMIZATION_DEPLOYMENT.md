# Firestore Optimization Deployment Guide

## System Status

The Firestore optimization system is now live and automatically detecting missing indexes. When queries fail due to missing composite indexes, the system:

1. **Catches the error** from Firestore REST API
2. **Parses the error** to extract collection and field requirements
3. **Registers the index** in `firestore.indexes.json`
4. **Queues it for deployment** (if configured)

## Current Setup

### Automatic Index Detection ✅
- All three integrated routes (`/api/rooms`, `/api/conflicts`, `/api/schedules`) now wrap their queries with the optimization service
- Index errors are automatically caught and registered
- The index definition is stored in `firestore.indexes.json`

### Manual Index Deployment

When you see index errors in the logs (like for `rooms`), follow these steps:

#### Step 1: Check Current Index Status
```bash
curl http://localhost:3000/api/debug/indexes
```

This returns:
- All registered indexes in `firestore.indexes.json`
- Deployment status (pending count, last deployment result)
- Performance metrics

#### Step 2: Review Missing Indexes
The debug endpoint shows which indexes are registered and pending deployment. For example, you'll see entries like:

```json
{
  "indexes": [
    {
      "collectionGroup": "rooms",
      "queryScope": "Collection",
      "fields": [
        {"fieldPath": "building", "order": "ASCENDING"},
        {"fieldPath": "roomName", "order": "ASCENDING"},
        {"fieldPath": "__name__", "order": "ASCENDING"}
      ]
    }
  ],
  "deployment": {
    "pending": 1,
    "config": {
      "autoDeployIndexes": false
    }
  }
}
```

#### Step 3: Deploy Indexes to Firebase

**Option A: Automatic Deployment (Recommended)**
```bash
# Enable auto-deployment
curl http://localhost:3000/api/debug/indexes?action=deploy
```

This configures the system to automatically deploy pending indexes using Firebase CLI.

**Option B: Manual Firebase CLI Deployment**
```bash
# Preview what will be deployed
firebase deploy --only firestore:indexes --dry-run

# Actually deploy
firebase deploy --only firestore:indexes
```

**Option C: Manual Index Creation in Firebase Console**

Each error message contains a direct link to create the index:
```
https://console.firebase.google.com/v1/r/project/for-commission/firestore/indexes?create_composite=...
```

Click the link to create indexes one-by-one through the Firebase Console.

## What Happens Next

Once indexes are deployed:

1. **First retry** of the failing query will succeed (using the new index)
2. **Results are cached** for 5-10 minutes depending on the route
3. **Subsequent requests** hit the cache (< 100ms) until it expires
4. **Performance jumps** from 5+ seconds to < 100ms on cache hits

## Current Logs Show

```
[DB] Fatal error after 0 retries (UNKNOWN): https://firestore.googleapis.com/v1/projects/for-commission/databases/(default)/documents:runQuery {
  error: 'Firestore REST error 400: [{"error":{"code":400,"message":"The query requires an index. You can create it here: https://console.firebase.google.com/...'
}
```

This error is **expected and handled**:
- ✅ It's caught by the optimization service
- ✅ The index requirement is parsed
- ✅ The index is registered in `firestore.indexes.json`
- ⏳ Next step: Deploy it to Firebase (Step 2 or 3 above)

## Integrated Routes

### GET /api/rooms
- **Cache Key**: `rooms:all`
- **Cache TTL**: 10 minutes
- **Query Pattern**: orderBy building, roomName
- **Status**: ✅ Optimization active, awaiting index deployment

### GET /api/conflicts
- **Cache Key**: `schedules:faculty:{userId}` or `schedules:all`
- **Cache TTL**: 5 minutes
- **Query Pattern**: facultyId filter + schedule fetch
- **Status**: ✅ Optimization active

### GET /api/schedules
- **Cache Key**: `schedules:{facultyId}:{sectionId}:{roomId}:{day}`
- **Cache TTL**: 5 minutes
- **Query Pattern**: Dynamic filters for department, section, room, day
- **Status**: ✅ Optimization active

## Performance Expectations

### Before Deployment
- First request: 4-9 seconds (includes index error, retry without orderBy)
- Second request: Still slow (same fallback)

### After Deployment
- First request: 4-9 seconds (one-time, creates index)
- Second request: < 100ms (cached)
- Subsequent requests: < 100ms (cached) for 5-10 minutes

## Troubleshooting

### Indexes Not Deploying
1. Verify Firebase CLI is installed: `firebase --version`
2. Authenticate Firebase: `firebase login`
3. Check project ID matches: `firebase projects:list`
4. Review logs: Check server console for deployment errors

### Cache Not Working
1. Check cache is enabled: `curl http://localhost:3000/api/debug/indexes | grep cache`
2. Verify cache TTL hasn't expired
3. Check browser DevTools Network tab for response headers

### Still Getting Index Errors
1. Confirm indexes were deployed: `firebase firestore:indexes`
2. Wait 5 minutes for Firestore to activate new indexes
3. Try the route again after activation

## File Locations

- **Index Definitions**: `firestore.indexes.json`
- **Optimization Service**: `src/lib/firestore-optimization-service.ts`
- **Query Cache**: `src/lib/firestore-query-cache.ts`
- **Index Manager**: `src/lib/firestore-index-manager.ts`
- **Debug Endpoint**: `src/app/api/debug/indexes/route.ts`

## Next Steps

1. ✅ Check status: `curl http://localhost:3000/api/debug/indexes`
2. ⏳ Deploy indexes: `firebase deploy --only firestore:indexes`
3. 🔄 Test routes: Make requests to `/api/rooms`, `/api/schedules`, `/api/conflicts`
4. 📊 Monitor performance: Subsequent requests should be < 100ms
