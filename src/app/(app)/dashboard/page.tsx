'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const DashboardView = dynamic(
  () => import('@/components/dashboard/DashboardView').then(m => ({ default: m.DashboardView })),
  { loading: () => <Loader2 className="h-8 w-8 animate-spin" /> }
);

export default function DashboardPage() {
  const { status } = useSession();
  const router = useRouter();

  if (status === 'unauthenticated') {
    router.push('/auth/login');
    return null;
  }

  return <DashboardView />;
}
