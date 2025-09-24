export type ID = string

export type User = {
  id: ID
  email: string
  name?: string
}

export type Story = {
  id: ID
  title: string
  body: string
  created_at: string
  updated_at: string
}

