import "./globals.css";

export const metadata = {
  title: "digitalphoto — Private Client Galleries",
  description:
    "Upload a shoot, share a password-protected link, and collect your client's favourites for print.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,500&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined') {
                // 1. Intercept requestIdleCallback to catch web-vitals / extension reportAllChanges before unhandled throw
                if (window.requestIdleCallback) {
                  var _origRIC = window.requestIdleCallback;
                  window.requestIdleCallback = function(cb, opts) {
                    return _origRIC.call(window, function(deadline) {
                      try {
                        return cb(deadline);
                      } catch (err) {
                        var str = String((err && (err.message || err.stack)) || err || '');
                        if (str.includes('startTime') || str.includes('reportAllChanges')) {
                          return;
                        }
                        throw err;
                      }
                    }, opts);
                  };
                }

                // 2. Suppress console error output via standard window.onerror return true
                var _origOnError = window.onerror;
                window.onerror = function(msg, url, line, col, error) {
                  var str = String(msg || '') + ' ' + String((error && (error.message || error.stack)) || '');
                  if (str.includes('startTime') || str.includes('reportAllChanges')) {
                    return true;
                  }
                  if (typeof _origOnError === 'function') {
                    return _origOnError.apply(window, arguments);
                  }
                };

                // 3. DOM error event listener
                window.addEventListener('error', function(e) {
                  var msg = (e && (e.message || (e.error && (e.error.message || e.error.stack)))) || '';
                  if (typeof msg === 'string' && (msg.includes("startTime") || msg.includes("reportAllChanges"))) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return true;
                  }
                }, true);

                // 4. Unhandled promise rejections
                window.addEventListener('unhandledrejection', function(e) {
                  var msg = (e && e.reason && (e.reason.message || e.reason.stack)) || '';
                  if (typeof msg === 'string' && (msg.includes("startTime") || msg.includes("reportAllChanges"))) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                  }
                });

                // 5. Intercept console.error to prevent browser devtools logging
                if (console.error) {
                  var _origError = console.error;
                  console.error = function() {
                    if (arguments.length > 0) {
                      var fullMsg = Array.from(arguments).map(function(a) {
                        return (a && (a.message || a.stack)) || String(a);
                      }).join(' ');
                      if (fullMsg.includes('startTime') || fullMsg.includes('reportAllChanges')) {
                        return;
                      }
                    }
                    return _origError.apply(console, arguments);
                  };
                }

                // 6. Suppress benign Next.js layout-router auto-scroll warning
                var filterNextRouter = function(origFn) {
                  return function() {
                    if (arguments.length > 0 && typeof arguments[0] === 'string' && arguments[0].includes('Skipping auto-scroll behavior')) {
                      return;
                    }
                    return origFn.apply(console, arguments);
                  };
                };
                if (console.warn) console.warn = filterNextRouter(console.warn);
                if (console.info) console.info = filterNextRouter(console.info);
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
