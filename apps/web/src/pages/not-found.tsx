import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/states';

export function NotFoundPage() {
  return (
    <Card className="mx-auto mt-10 max-w-lg">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="Check the address, or head back to the overview."
        action={
          <Button asChild variant="primary">
            <Link to="/">Go to overview</Link>
          </Button>
        }
      />
    </Card>
  );
}
