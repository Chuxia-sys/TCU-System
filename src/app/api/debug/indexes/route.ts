import { NextRequest, NextResponse } from 'next/server';
import { optimizationService } from '@/lib/firestore-optimization-service';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'deploy') {
    console.log('[Debug] Triggering index deployment...');
    optimizationService.configureAll({ autoDeployIndexes: true });
    // Since deployer is server-only, log what would be deployed
    const report = optimizationService.getStatusReport();
    return NextResponse.json({
      message: 'Index deployment triggered',
      deployment: report.deployment,
      indexes: report.indexes,
    });
  }

  if (action === 'status') {
    optimizationService.logStatus();
    const report = optimizationService.getStatusReport();
    return NextResponse.json(report);
  }

  // Default: return comprehensive status
  const report = optimizationService.getStatusReport();
  optimizationService.logStatus();

  return NextResponse.json({
    status: 'success',
    indexes: report.indexes,
    deployment: report.deployment,
    performance: report.performance,
    health: report.healthScore,
    endpoints: {
      status: '/api/debug/indexes?action=status',
      deploy: '/api/debug/indexes?action=deploy',
    },
  });
}

