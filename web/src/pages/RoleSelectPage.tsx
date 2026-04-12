import { useState } from "react";

export default function RoleSelectPage({ onSelect }: { onSelect: (role: "client" | "data") => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function choose(role: "client" | "data") {
    setBusy(true);
    setError("");
    try {
      await onSelect(role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set role");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <section className="card center">
        <h1>NanoDFS</h1>
        <p>Select this instance role. The role is saved locally.</p>
        <div className="button-row">
          <button className="button" disabled={busy} onClick={() => choose("client")}>
            Configure as Client Node
          </button>
          <button className="button" disabled={busy} onClick={() => choose("data")}>
            Configure as Data Node
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
