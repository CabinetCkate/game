// Bound both connection and response-body waits so forms can always recover.
export async function request(url, options = {}) {
 const {timeoutMs = 10000, ...requestOptions} = options;
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), timeoutMs);
 const cancel = () => controller.abort();
 options.signal?.addEventListener('abort', cancel, {once:true});
 if(options.signal?.aborted)cancel();
 try {
  const response = await fetch(url, {...requestOptions, signal:controller.signal});
  const text = await response.text();
  return {response,text};
 } finally {
  clearTimeout(timeout);
  options.signal?.removeEventListener('abort', cancel);
 }
}
