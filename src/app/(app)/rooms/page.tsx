'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const RoomsView = dynamic(
  () => import('@/components/tables/RoomsView').then(m => ({ default: m.RoomsView })),
  { loading: () => <Loader2 className="h-8 w-8 animate-spin" /> }
);

export default function RoomsPage() {
  const { status } = useSession();
  const router = useRouter();

  if (status === 'unauthenticated') {
    router.push('/auth/login');
    return null;
  }

  return <RoomsView />;
}
