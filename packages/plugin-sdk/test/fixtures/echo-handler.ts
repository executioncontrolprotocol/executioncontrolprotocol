export default async function handler(input: { value: string }): Promise<{ echo: string }> {
  return { echo: input.value }
}
