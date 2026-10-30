/**
 * Cursor-Aware Circular Fill (Ripple Reveal) Hover Engine
 *
 * Implements the 360Learning-style radial circle hover effect:
 * 1. Entry: Circular fill begins at exact cursor entry coordinates (x, y) with radius 0,
 *    expanding outward in ~0.22s to cover the entire button geometry.
 * 2. Label: Text and icons smoothly transition color as the fill spreads.
 * 3. Exit: Upon mouseleave, the circle's origin and boundaries collapse directly towards
 *    the exit cursor coordinates, shrinking down to 0 at the boundary.
 */

let isInitialized = false;

export function initCursorAwareHover() {
  if (typeof window === 'undefined' || isInitialized) return;
  isInitialized = true;

  const BUTTON_SELECTOR = '.btn-primary, .btn-secondary, .submit-btn, .btn-cursor-aware';

  function getCircle(btn) {
    let circle = btn.querySelector(':scope > .btn-radial-circle');
    if (!circle) {
      circle = document.createElement('span');
      circle.className = 'btn-radial-circle';
      circle.setAttribute('aria-hidden', 'true');
      btn.appendChild(circle);
    }
    return circle;
  }

  function handlePointerOver(e) {
    // Only respond to mouse or precision pointer devices
    if (e.pointerType && e.pointerType !== 'mouse') return;

    const btn = e.target.closest(BUTTON_SELECTOR);
    if (!btn || btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;

    // Prevent duplicate triggers if pointer moves between children inside the same button
    if (e.relatedTarget && btn.contains(e.relatedTarget)) return;

    const circle = getCircle(btn);
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Calculate maximum radius to the furthest corner to ensure 100% button coverage
    const dx = Math.max(x, rect.width - x);
    const dy = Math.max(y, rect.height - y);
    const radius = Math.hypot(dx, dy);
    const targetDiameter = Math.ceil(radius * 2.2);

    // Instantly position circle at entry coordinates with 0 diameter
    circle.style.transition = 'none';
    circle.style.left = `${x}px`;
    circle.style.top = `${y}px`;
    circle.style.width = '0px';
    circle.style.height = '0px';
    circle.style.opacity = '1';

    // Force synchronous browser layout reflow
    void circle.offsetHeight;

    // Trigger smooth outward radial expansion in ~0.22s
    circle.style.transition = 'width 0.22s cubic-bezier(0.25, 1, 0.5, 1), height 0.22s cubic-bezier(0.25, 1, 0.5, 1)';
    circle.style.width = `${targetDiameter}px`;
    circle.style.height = `${targetDiameter}px`;
  }

  function handlePointerOut(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;

    const btn = e.target.closest(BUTTON_SELECTOR);
    if (!btn) return;

    // Ignore if still within the button
    if (e.relatedTarget && btn.contains(e.relatedTarget)) return;

    const circle = btn.querySelector(':scope > .btn-radial-circle');
    if (!circle) return;

    const rect = btn.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    // Clamp exit coordinates to button bounding box so contraction converges on exit edge
    const exitX = Math.max(0, Math.min(rect.width, rawX));
    const exitY = Math.max(0, Math.min(rect.height, rawY));

    // Shrink diameter to 0 while moving center to the exit point
    circle.style.transition = 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1), top 0.2s cubic-bezier(0.4, 0, 0.2, 1), width 0.2s cubic-bezier(0.4, 0, 0.2, 1), height 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease';
    circle.style.left = `${exitX}px`;
    circle.style.top = `${exitY}px`;
    circle.style.width = '0px';
    circle.style.height = '0px';
  }

  document.addEventListener('mouseover', handlePointerOver, true);
  document.addEventListener('mouseout', handlePointerOut, true);
}

