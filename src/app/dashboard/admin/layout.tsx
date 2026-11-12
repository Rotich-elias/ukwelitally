import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Admin overview',
  description:
    'Administrator overview of the UkweliTally workspace: submissions, volunteers, candidates, locations and platform-wide tally activity.',
  robots: { index: false, follow: false },
}

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return children
}
