/**
 * Safely reads a Fetch Response body as JSON without throwing
 * "Unexpected end of JSON input" on empty or non-JSON server responses.
 */
export async function parseJsonResponse<T extends object>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
