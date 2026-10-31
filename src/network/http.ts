import { LocalizedError } from '../i18n/messages.ts'

export class HttpError extends LocalizedError {
  readonly response: Response

  constructor(response: Response, url: string) {
    super('errors.httpRequest', { url: response.url || url, status: response.status })
    this.name = 'HttpError'
    this.response = response
  }
}

export async function request(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init)
  if (!response.ok) {
    const url = typeof input === 'string' ? input : 'url' in input ? input.url : input.href
    throw new HttpError(response, url)
  }
  return response
}
