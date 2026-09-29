import { FileText, Inbox, KeyRound, ListFilter, Mail, Webhook } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { orgPath, useOrg } from './org-context';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cmd+K: jump to a message by id, filter logs by an address, or open a page. */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { org } = useOrg();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const go = (path: string) => {
    onOpenChange(false);
    setQuery('');
    void navigate(orgPath(org.id, path));
  };
  const trimmed = query.trim();
  const isId = UUID.test(trimmed);
  const isEmail = !isId && trimmed.includes('@');

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Message id, email address, or page…"
        value={query}
        onValueChange={setQuery}
        autoFocus
      />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        {isId ? (
          <CommandGroup heading="Message">
            <CommandItem value={`open ${trimmed}`} onSelect={() => go(`/logs?m=${trimmed}`)}>
              <Mail /> Open message <code className="ml-1 text-xs">{trimmed}</code>
            </CommandItem>
          </CommandGroup>
        ) : null}
        {isEmail ? (
          <CommandGroup heading="Logs">
            <CommandItem
              value={`logs ${trimmed}`}
              onSelect={() => go(`/logs?q=${encodeURIComponent(trimmed)}`)}
            >
              <ListFilter /> Show emails to <span className="ml-1 font-medium">{trimmed}</span>
            </CommandItem>
          </CommandGroup>
        ) : null}
        <CommandGroup heading="Go to">
          <CommandItem value="logs" onSelect={() => go('/logs')}>
            <ListFilter /> Logs
          </CommandItem>
          <CommandItem value="mailboxes" onSelect={() => go('/mailboxes')}>
            <Inbox /> Mailboxes
          </CommandItem>
          <CommandItem value="api keys" onSelect={() => go('/api-keys')}>
            <KeyRound /> API keys
          </CommandItem>
          <CommandItem value="templates" onSelect={() => go('/templates')}>
            <FileText /> Templates
          </CommandItem>
          <CommandItem value="webhooks" onSelect={() => go('/webhooks')}>
            <Webhook /> Webhooks
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
