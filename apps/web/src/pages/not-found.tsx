import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/states';

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="Check the address, or head back to the overview."
      action={
        <Button asChild>
          <Link to="/">Go to overview</Link>
        </Button>
      }
    />
  );
}
