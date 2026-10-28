# 0012. Contacts and lists

Date: 2026-10-02
Status: Accepted

## Context

Until now a tenant named a recipient in every request and Postrail remembered nothing
about them. Sending one message to many people (ADR 0013) needs somewhere to keep those
people, the values a template needs for each of them, and a way to group them.

Contacts are not end users (ADR 0011). An end user is someone who can sign in to the
tenant's app; a contact is someone the tenant sends email to. They live in separate
tables and neither creates the other.

## Decision

**A contact is an address plus string properties.** `contacts` is unique on
`(org_id, email)`, lowercased like suppressions. `properties` is a JSON object whose
names follow the rule for template placeholders, so `first_name` on a contact fills
`{{first_name}}` in a template with no mapping step. Values are strings, at most fifty
per contact.

**Lists are named groups, many-to-many.** `contact_lists` is unique on `(org_id, name)`
and `contact_list_members` joins the two. A broadcast is sent to one list. Deleting a
list leaves its contacts; deleting a contact removes it from every list.

**Adding is an upsert.** `POST /v1/contacts` with an address that already exists merges
the given properties into the stored ones and adds the given lists, and answers `200`
instead of `201`. An integration can call it on every sign-up without first asking
whether the person is known. `PATCH` is the opposite on purpose: each field given
replaces what is stored, so a list can be cleared.

**Import is JSON, in batches of 1000.** `POST /v1/contacts/import` upserts in one
statement and reports `created` and `updated`. CSV is parsed in the dashboard
(`pages/contacts/csv.ts`): the `email` column is the address, every other column becomes
a property with its header turned into a placeholder name, and the browser sends as many
batches as the file needs. Keeping CSV out of the API keeps one wire format.

**Suppression is shown, not copied.** A contact carries `suppressed: true` while its
address is on the org's suppression list. There is no second flag to keep in step: the
suppression list stays the single place that decides whether an address is sent to, and
an unsubscribe (ADR 0013) lands there.

**Ids from the request are re-read inside the org.** Putting contacts on lists takes ids
from the caller. The foreign keys alone would accept a row that belongs to another
tenant, so the repo selects both sides inside the org's transaction first and only joins
what it found.

## Consequences

- A template variable and a contact property are the same word, which is simple and
  means a typo in a CSV header shows up as "missing template variables" at send time.
- The upsert makes `POST` idempotent in effect, but it also means a typo'd address makes
  a new contact rather than an error.
- An import of 1000 rows is one transaction; a file with a hundred thousand rows is a
  hundred requests from the browser and stops where it fails, with the earlier batches
  kept. The dashboard says how many were saved.
- Listing contacts by list uses a subquery on the join table, which is fine at this
  scale and wants a different index if lists reach millions.
- There are no custom field types, no segments and no double opt-in.
