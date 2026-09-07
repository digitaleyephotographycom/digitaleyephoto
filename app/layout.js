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
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,500&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined') {
                window.addEventListener('error', function(e) {
                  if (e && e.message && e.message.includes("reading 'startTime'")) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                  }
                }, true);
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
