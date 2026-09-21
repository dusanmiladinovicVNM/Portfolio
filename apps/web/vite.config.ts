import { defineConfig, type Plugin } from 'vite';

const BROWSER_TEST_COOKIE = '__portfolio_browser_test=1';

function browserHarnessFallback(): Plugin {
  return {
    name: 'portfolio-browser-harness-fallback',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const acceptsHtml = request.headers.accept?.includes('text/html') ?? false;
        const isBrowserTest =
          request.headers.cookie?.includes(BROWSER_TEST_COOKIE) ?? false;

        if (
          acceptsHtml &&
          isBrowserTest &&
          request.url &&
          !request.url.startsWith('/browser-harness.html')
        ) {
          const searchIndex = request.url.indexOf('?');
          const search =
            searchIndex === -1 ? '' : request.url.slice(searchIndex);
          request.url = `/browser-harness.html${search}`;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [browserHarnessFallback()],
});
