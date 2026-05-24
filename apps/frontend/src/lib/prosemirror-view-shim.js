// Re-export the real prosemirror-view via the side-door alias (no circular dep)
const pv = require('prosemirror-view-real');
module.exports = { ...pv };

// __serializeForClipboard was removed in prosemirror-view 1.38+ but
// @blocknote/core 0.20 still imports it. Provide a compatible stub.
if (!module.exports.__serializeForClipboard) {
  module.exports.__serializeForClipboard = function (view, slice) {
    const serializer =
      (view.someProp && view.someProp('clipboardSerializer')) ||
      (view.state && view.state.schema && view.state.schema.serializer);
    const wrap = document.createElement('div');
    if (serializer && slice && slice.content) {
      wrap.appendChild(serializer.serializeFragment(slice.content));
    }
    return { dom: wrap, text: wrap.textContent || '' };
  };
}
