'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const MyScheduleResponsesView = dynamic(
  () => import('@/components/responses/MyScheduleResponsesView').then(m => ({ default: m.MyScheduleResponsesView })),
  { loading: () => <Loader2 className="h-8 w-8 animate-spin" /> }
);

export default function MyScheduleResponsesPage() {
  const { status } = useSession();
  const router = useRouter();

  if (status === 'unauthenticated') {
    router.push('/auth/login');
    return null;
  }

  return <MyScheduleResponsesView />;
}
