
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
          <h2 className="text-lg font-semibold">Application error</h2>
          <p className="text-muted">{error?.message}</p>
        </div>
      </body>
    </html>
  );
}