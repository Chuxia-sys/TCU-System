'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const SchedulesView = dynamic(
  () => import('@/components/tables/SchedulesView').then(m => ({ default: m.SchedulesView })),
  { loading: () => <Loader2 className="h-8 w-8 animate-spin" /> }
);

export default function SchedulesPage() {
  const { status } = useSession();
  const router = useRouter();

  if (status === 'unauthenticated') {
    router.push('/auth/login');
    return null;
  }

  return <SchedulesView />;
}
