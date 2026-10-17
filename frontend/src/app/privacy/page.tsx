import Link from 'next/link';

export const metadata = { title: 'Privacy Policy - ReachInbox Scheduler' };

/** Plain privacy policy, required by Google to publish the OAuth consent screen. */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-gray-700">
      <h1 className="text-2xl font-semibold text-gray-900">Privacy Policy</h1>
      <p className="mt-1 text-xs text-gray-400">Last updated: 17 October 2026</p>

      <p className="mt-6">
        ReachInbox Scheduler is a demo application built for the Outbox Labs SDE intern assignment. It is not a
        commercial service.
      </p>

      <h2 className="mt-6 font-semibold text-gray-900">What we collect</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>From Google sign-in: your name, email address and profile picture URL, used only to show who is logged in.</li>
        <li>Emails you schedule (subject, body, recipient addresses) and their delivery status.</li>
        <li>If you connect Slack: the workspace name, channel and webhook used to post rate-limit alerts.</li>
      </ul>

      <h2 className="mt-6 font-semibold text-gray-900">How it is used</h2>
      <p className="mt-2">
        Only to run the scheduler: show your dashboard, send scheduled emails through Ethereal (a fake SMTP test
        service - no email reaches a real inbox) and post alerts to the Slack channel you chose. Nothing is sold or
        shared with third parties, and no Google data other than your basic profile is requested.
      </p>

      <h2 className="mt-6 font-semibold text-gray-900">Deletion</h2>
      <p className="mt-2">
        You can disconnect Slack at any time from the dashboard. To have your data deleted, email{' '}
        <a className="text-brand-600 hover:underline" href="mailto:shuklabhavy90@gmail.com">shuklabhavy90@gmail.com</a>.
      </p>

      <p className="mt-10">
        <Link href="/" className="text-brand-600 hover:underline">
          ← Back to ReachInbox Scheduler
        </Link>
      </p>
    </main>
  );
}
