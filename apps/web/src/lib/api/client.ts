export type Me = { id: string; email: string; name?: string }

export async function getMe(): Promise<Me> {
  const res = await fetch('/api/me', { credentials: 'include' })
  if (!res.ok) throw new Error('unauthorized')
  return res.json()
}

