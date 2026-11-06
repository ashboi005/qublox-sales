# Gmail delivery for the pilot

Qublox supports **Send now** for a single approved email and **Schedule reviewed emails** for a selected batch. Choose one configured Gmail account, or a pool; the worker uses the least recently used eligible account. Scheduling spreads requested times through your chosen window. The existing PostgreSQL worker handles due items; no cron or paid outreach service is required.

Approval alone does not send. A separate send/schedule action queues the exact approved recipient, subject and body. Editing the prospect or offer cancels queued snapshots. Instagram and follow-up drafting/sending remain manual. The app does not synchronize Gmail replies yet; mark replies or opt-outs promptly to stop work in the app.

## Connect Gmail

For this small internal tool, the first adapter uses Gmail App Passwords over TLS to `smtp.gmail.com:465`. Enable Google 2-Step Verification and generate an App Password yourself. Do not use your regular Gmail password. Some account policies do not offer App Passwords; those accounts need a future OAuth connection rather than weakening their protections. References: [Google App Passwords](https://support.google.com/accounts/answer/185833), [Nodemailer Gmail authentication](https://nodemailer.com/guides/using-gmail).

Store these only in private root `.env` (Docker/root launcher), and mirror them to `apps/server/.env.local` if starting the API/worker directly:

```dotenv
EMAIL_SENDING_ENABLED=false
GMAIL_ACCOUNTS_JSON='[{"id":"primary","email":"your-account@gmail.com","appPassword":"REPLACE_16_CHARS"}]'
GMAIL_SENDER_NAME=Qublox
DAILY_CONTACT_LIMIT=10
EMAIL_MIN_INTERVAL_SECONDS=120
EMAIL_ACCOUNT_INTERVAL_SECONDS=600
```

Replace the placeholder with the generated App Password. The parser accepts Google's grouped spaces and validates 16 alphanumeric characters. Add another object with a distinct ID/address for another account. Set `EMAIL_SENDING_ENABLED=true` only when ready, then restart/recreate API and worker. Leave it false to pause dispatch; queued records remain stored and uncertain-attempt recovery still runs. Settings show configured sender addresses, never passwords. Configuration is not a successful SMTP authentication test.

No custom domain is needed to send as your actual Gmail address. Dashboard membership and Gmail sender accounts are separate. `team:add` grants dashboard access; it does not connect someone's Gmail account.

## Use it

1. Research a prospect and save an evidence-linked draft. Review the copy, recipient and offer; approve that exact version.
2. On the review screen, select the Gmail sender(s) and **Send now**, or choose a time window. From Prospects, expand **Schedule reviewed emails**, select approved drafts on the current page, choose a pool/window, and schedule.
3. Use **Outbox** to see queued, sending, accepted, failed and uncertain attempts. Move a queued item to the next available slot or cancel it. Open its review screen to choose a particular sender when expediting.
4. The initial cap is **10 contacts/send attempts per rolling 24 hours across the whole workspace**, including manual contact logs and in-flight, uncertain or rejected SMTP attempts. It is not multiplied by adding accounts. Defaults also leave two minutes between attempts globally and ten minutes per account. Limits may postpone the requested time beyond the selected window; it is not a repeating business-hours calendar.
5. Gmail acceptance records the contact and starts the seven-day follow-up reminder. Acceptance is not evidence of inbox placement or delivery to a person. Replies and suppression need to be recorded manually because no inbox sync exists.

## Unknown outcomes and recovery

SMTP does not provide an application-level exactly-once guarantee. A connection can drop after Gmail accepts the message, or the worker can stop before storing the result. These outcomes become **uncertain**, never automatic retries. Check the original recipient/message in Gmail Sent, then explicitly confirm sent or not sent in the prospect review. A mistaken “not sent” confirmation can cause a duplicate on a later retry. Recovery alone never resends.

A sending attempt has a 45-second absolute deadline anchored to its database claim. The adapter owns and destroys the actual TLS socket on expiry; inactivity limits alone are insufficient. A delayed worker cannot open SMTP after that deadline. Sending rows older than two minutes become uncertain, including while dispatch is disabled. Database admissions and reservations coordinate workers, so two workers cannot dispatch the same queued item or exceed the shared allowance through separate sender accounts.

## Personalization and deliverability

The worker sends the reviewed text unchanged. AI drafts are grounded in each prospect's evidence and offer, but wording can repeat. There is no spintax step after approval and no promise of mathematically unique messages. Changing words, randomizing timestamps and rotating accounts do not guarantee avoiding spam. [Google's sender guidance](https://support.google.com/mail/answer/81126) still applies; mailbox/provider reputation and recipient responses are outside this app's control.

Use the sender pool for accounts you legitimately control. The integration does not spoof From addresses, bypass account limits, buy warm-up traffic or claim inbox placement. A VPS connection can be blocked by Gmail's account security checks; investigate the account/network rather than automatically retrying through every sender.

## Verification

SMTP tests use injected fake transports and a dedicated local database. The workflow simulation records one fake SMTP acceptance and proves it is not dispatched twice, without opening an external SMTP connection. No real Gmail send was performed: Gmail credentials were not supplied. A successful real-account connection and a deliberate recipient-approved test are still required before relying on delivery.
