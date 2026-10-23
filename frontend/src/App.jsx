import { useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1";

export default function App() {
  const [message, setMessage] = useState("Not checked yet");
  const [loading, setLoading] = useState(false);

  async function checkBackend() {
    setLoading(true);
    setMessage("Checking...");

    try {
      const response = await fetch(`${API_BASE_URL}/health`);

      if (!response.ok) {
        throw new Error("Backend returned an error");
      }

      const data = await response.json();

      if (data.status !== "ok") {
        throw new Error("Unexpected health response");
      }

      setMessage(`Connected: ${data.service}`);
    } catch {
      setMessage(
        "Connection failed. Check that the backend is running on port 5000.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>TaskFlow</h1>
      <p>Shared application setup</p>

      <button onClick={checkBackend} disabled={loading}>
        {loading ? "Checking..." : "Check backend connection"}
      </button>

      <p role="status">{message}</p>
    </main>
  );
}