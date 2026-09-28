import { Link as RLink } from 'react-router-dom';
// Accepts `href` (Next-style) or `to`; external URLs open in a new tab.
export default function Link({ href, to, children, ...rest }) {
  const target = href ?? to ?? '/';
  if (/^https?:\/\//.test(target)) return <a href={target} target="_blank" rel="noreferrer" {...rest}>{children}</a>;
  return <RLink to={target} {...rest}>{children}</RLink>;
}
