const baseUrl = import.meta.env?.BASE_URL ?? '/'

export function appUrl(path = '', base = baseUrl): string {
  return `${base}${path}`
}

export function appPathname(pathname: string, base = baseUrl): string {
  return pathname.slice(base.length - 1).replace(/\/+$/, '') || '/'
}
