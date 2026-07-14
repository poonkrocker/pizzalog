import type { ApiClient } from './client';

export function uploadsApi(client: ApiClient) {
  return {
    /** Sube una imagen ya recortada; devuelve su URL pública. */
    image: (file: Blob) => client.postFile<{ url: string }>('/uploads/image', file),
  };
}
