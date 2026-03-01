import Link from 'next/link';
import { Home, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-blue-500/10 flex items-center justify-center">
          <FileQuestion className="w-10 h-10 text-blue-500" />
        </div>
        
        <h1 className="text-4xl font-bold text-[var(--text-primary)] mb-2">404</h1>
        <h2 className="text-xl font-semibold text-[var(--text-secondary)] mb-4">
          Page Not Found
        </h2>
        
        <p className="text-[var(--text-muted)] mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>

        <Link href="/dashboard">
          <Button>
            <Home className="w-4 h-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
