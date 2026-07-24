import type { AiRestockRequest, RestockReport } from '../types/api';

export async function fetchAiRestock(data: AiRestockRequest): Promise<RestockReport> {
  const res = await fetch('/api/ai/restock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.error || "Erreur lors de l'appel à l'API IA.");
  }

  return res.json() as Promise<RestockReport>;
}
