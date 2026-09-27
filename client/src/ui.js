// Helpers for HTML UI panels shown on top of the Phaser canvas.

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Adds an HTML panel centered on screen that stays centered when the window resizes.
export function addCenteredPanel(scene, html) {
  const panel = scene.add.dom(scene.scale.width / 2, scene.scale.height / 2).createFromHTML(html);
  const recenter = (size) => panel.setPosition(size.width / 2, size.height / 2);
  scene.scale.on('resize', recenter);
  scene.events.once('shutdown', () => scene.scale.off('resize', recenter));
  return panel;
}
