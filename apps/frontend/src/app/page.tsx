import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE } from '@/lib/api/constants';
import { LandingPage } from './(landing)/LandingPage';

export default async function RootPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_COOKIE)?.value;
  if (token) {
    redirect('/now-brief');
  }
  return <LandingPage />;
}
