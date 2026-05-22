'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const ScheduleResponsesView = dynamic(
  () => import('@/components/responses/ScheduleResponsesView').then(m => ({ default: m.ScheduleResponsesView })),
  { loading: () => <Loader2 className="h-8 w-8 animate-spin" /> }
);

export default function ScheduleResponsesPage() {
  const { status } = useSession();
  const router = useRouter();

  if (status === 'unauthenticated') {
    router.push('/auth/login');
    return null;
  }

  return <ScheduleResponsesView />;
}
