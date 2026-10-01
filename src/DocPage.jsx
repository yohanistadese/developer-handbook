import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import Markdown from 'react-markdown';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import { findDoc, resolveAsset, toRoute } from './docs';

const isExternal = (href) => /^([a-z][a-z\d+.-]*:|\/\/)/i.test(href);

function resolvePath(href, file) {
  const url = new URL(href, `http://handbook${file}`);
  return { path: decodeURIComponent(url.pathname), suffix: url.search + url.hash };
}

function NotFound() {
  return (
    <div className="not-found">
      <h1>404</h1>
      <p>This page doesn't exist.</p>
      <p>
        <Link to="/">Back to the handbook</Link>
      </p>
    </div>
  );
}

export default function DocPage() {
  const { pathname, hash } = useLocation();
  let route;
  try {
    route = toRoute(decodeURIComponent(pathname));
  } catch {
    route = null;
  }
  const doc = route && findDoc(route);
  const [loaded, setLoaded] = useState(null);
  const content = doc && loaded?.file === doc.file ? loaded.content : null;

  useEffect(() => {
    if (!doc) return;
    let active = true;
    doc.load().then((text) => active && setLoaded({ file: doc.file, content: text }));
    return () => {
      active = false;
    };
  }, [doc]);

  useEffect(() => {
    if (doc && content === null) return;
    document.title = content?.match(/^#\s+(.+)$/m)?.[1] ?? (doc ? 'Developer Handbook' : 'Page not found');
    const target = hash && document.getElementById(decodeURIComponent(hash.slice(1)));
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [doc, content, hash]);

  if (doc && route !== pathname) return <Navigate to={route + hash} replace />;

  const components = {
    a({ href = '', node, ...props }) {
      if (isExternal(href) || href.startsWith('#')) return <a href={href} {...props} />;
      const { path, suffix } = resolvePath(href, doc.file);
      if (/\.md$/i.test(path)) return <Link to={toRoute(path) + suffix} {...props} />;
      return <a href={resolveAsset(path) ?? href} {...props} />;
    },
    img({ src = '', node, ...props }) {
      const resolved = isExternal(src) ? src : (resolveAsset(resolvePath(src, doc.file).path) ?? src);
      return <img src={resolved} {...props} />;
    },
  };

  return (
    <main className="doc">
      {!doc && <NotFound />}
      {content !== null && (
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={components}>
          {content}
        </Markdown>
      )}
    </main>
  );
}
