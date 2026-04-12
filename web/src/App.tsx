import { useEffect, useState } from "react";
import { getRole, setRole } from "./api";
import type { NodeRole } from "./types";
import RoleSelectPage from "./pages/RoleSelectPage";
import ClientPage from "./pages/ClientPage";
import DataNodePage from "./pages/DataNodePage";

export default function App() {
  const [role, setRoleState] = useState<NodeRole>("unselected");
  const [error, setError] = useState("");

  useEffect(() => {
    getRole()
      .then((response) => setRoleState(response.role))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load role"));
  }, []);

  async function onSelect(nextRole: "client" | "data") {
    const saved = await setRole(nextRole);
    setRoleState(saved.role);
  }

  if (error) {
    return (
      <main className="page">
        <section className="card">
          <h1>NanoDFS</h1>
          <p className="error">{error}</p>
        </section>
      </main>
    );
  }

  if (role === "unselected") {
    return <RoleSelectPage onSelect={onSelect} />;
  }

  if (role === "data") {
    return <DataNodePage />;
  }

  return <ClientPage />;
}
