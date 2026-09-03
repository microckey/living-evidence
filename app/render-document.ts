type SocialMetadata = {
  title: string;
  description: string;
};

function escapeAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function renderDocument(
  request: Request,
  source: string,
  metadata: SocialMetadata,
) {
  const url = new URL(request.url);
  const title = escapeAttribute(metadata.title);
  const description = escapeAttribute(metadata.description);
  const pageUrl = escapeAttribute(url.href);
  const imageUrl = escapeAttribute(new URL('/og.png', url.origin).href);
  const socialMetadata = `
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:image" content="${imageUrl}">
<meta property="og:image:width" content="1734">
<meta property="og:image:height" content="907">
<meta property="og:image:alt" content="Living Evidence — Documents your AI can cross-examine.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${imageUrl}">`;

  return new Response(source.replace('</head>', `${socialMetadata}\n</head>`), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  });
}
