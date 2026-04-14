export function getCwd(): string {
  try {
    return process.cwd()
  } catch {
    return process.cwd()
  }
}

export function pwd(): string {
  return getCwd()
}
