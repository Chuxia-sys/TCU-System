import { NextResponse } from 'next/server';
import { validateFirestoreConnection, getFirestoreStatus } from '@/lib/db';

export async function GET() {
  // Validate Firestore connection
  const firestore = await validateFirestoreConnection();
  const status = getFirestoreStatus();
  
  return NextResponse.json({ 
    status: firestore.connected ? 'healthy' : 'degraded', 
    timestamp: new Date().toISOString(),
    service: 'tcu-scheduling',
    database: {
      type: 'Firebase Firestore',
      project: firestore.project,
      connected: firestore.connected,
      error: firestore.error || null,
      validated: status.validated,
    },
    note: 'This system uses Firebase Firestore exclusively. SQLite/Prisma is NOT used at runtime.'
  }, { 
    status: firestore.connected ? 200 : 503 
  });
}
