// A small helper for building screens. Text always goes in as text, so a title can never become markup.
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (name === 'class') node.className = value;
    else if (name === 'dataset') Object.assign(node.dataset, value);
    else if (name.startsWith('on')) node.addEventListener(name.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(name, '');
    else if (value !== false && value !== null && value !== undefined) node.setAttribute(name, value);
  }
  node.append(...children.flat(Infinity).filter((child) => child !== null && child !== undefined));
  return node;
}

const NUMBER = new Intl.NumberFormat();

export function formatCount(count) {
  return NUMBER.format(count);
}

export function words(count) {
  return `${formatCount(count)} ${count === 1 ? 'word' : 'words'}`;
}
