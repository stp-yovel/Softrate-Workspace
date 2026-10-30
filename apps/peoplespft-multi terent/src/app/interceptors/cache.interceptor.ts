import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { of, tap } from 'rxjs';
import { HttpCacheService } from '../services/cache.service';

export const cacheInterceptor: HttpInterceptorFn = (req, next) => {
  const cache = inject(HttpCacheService);

  // When mutations occur (POST, PUT, PATCH, DELETE), automatically invalidate matching cached GETs
  if (req.method !== 'GET') {
    try {
      const urlPath = req.url.split('?')[0];
      const urlParts = urlPath.split('/');
      const apiIdx = urlParts.indexOf('api');
      if (apiIdx !== -1 && urlParts.length > apiIdx + 1) {
        const resource = `/api/${urlParts[apiIdx + 1]}`;
        cache.clear(resource);
      } else {
        cache.clear();
      }
    } catch (_) {
      cache.clear();
    }
    return next(req);
  }

  // Bypass cache if request specifies no-cache or skip header
  if (req.headers.has('X-Skip-Cache') || req.headers.get('Cache-Control') === 'no-cache') {
    return next(req);
  }

  const cachedResponse = cache.get(req.urlWithParams);

  if (cachedResponse) {
    return of(cachedResponse);
  }

  return next(req).pipe(
    tap(event => {
      if (event instanceof HttpResponse) {
        cache.put(req.urlWithParams, event);
      }
    })
  );
};
