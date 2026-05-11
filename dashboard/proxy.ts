import { NextRequest, NextResponse } from 'next/server';
import { enforceDashboardAuth } from './src/lib/server/dashboard-auth';

export function proxy(request: NextRequest) {
  return enforceDashboardAuth(request) ?? NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
