import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-start justify-center gap-6 px-6">
      <p className="font-mono text-ink-faint">404</p>
      <h1 className="text-5xl font-semibold">Page not found</h1>
      <Link href="/" className="text-lg underline underline-offset-4">
        Back to the classroom
      </Link>
    </main>
  );
}
