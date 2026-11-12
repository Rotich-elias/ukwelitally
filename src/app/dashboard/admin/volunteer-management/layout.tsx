import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Volunteer management',
  description:
    'Manage volunteer registrations, filter applicants by location and status, and approve observers for polling station assignments.',
  robots: { index: false, follow: false },
}

export default function VolunteerManagementLayout({ children }: { children: React.ReactNode }) {
  return children
}
