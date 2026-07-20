export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-5xl font-bold">BP Studio</h1>

        <p className="mt-2 text-neutral-400">
          Every creation begins with curiosity.
        </p>

        <div className="mt-10 rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
          <h2 className="text-2xl font-semibold">
            Continue
          </h2>

          <p className="mt-2 text-neutral-400">
            BP005 · You've Never Seen Your Own Face
          </p>

          <button className="mt-6 rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-neutral-200">
            Continue →
          </button>
        </div>
      </div>
    </main>
  )
}