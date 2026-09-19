import { describe, expect, it, vi } from 'vitest';
import { FlowLabelLayer, type FlowLabelPlacement } from './semanticFlowLabels';

describe('Architecture label pointer geometry', () => {
  it('keeps the same DOM hit box during selection and releases it on leaving or navigation', () => {
    const element = document.createElement('button'); document.body.append(element);
    element.showPopover = vi.fn(); element.hidePopover = vi.fn();
    element.getBoundingClientRect = () => new DOMRect(900, 450, 210, 60);
    const layer = new FlowLabelLayer(vi.fn());
    const label: FlowLabelPlacement = { id: 'suite', label: 'Suite', path: '', x: 890, y: 480, width: 210, height: 60, selected: false, match: false };
    layer.update([label]); layer.attach(label.id, element); layer.pinPointerLabel(label.id);
    layer.update([{ ...label, selected: true, x: 740, y: 390, width: 225, height: 78 }]);
    expect(element.style.position).toBe('fixed'); expect(element.style.left).toBe('900px');
    expect(element.style.top).toBe('450px'); expect(element.style.width).toBe('210px');
    expect(element.style.height).toBe('60px'); expect(element.showPopover).toHaveBeenCalledTimes(1);
    layer.pinPointerLabel(label.id); expect(element.showPopover).toHaveBeenCalledTimes(1);
    layer.releasePointerLabel('previous-label'); expect(element.hasAttribute('popover')).toBe(true);
    layer.releasePointerLabel(); expect(element.hasAttribute('popover')).toBe(false);
    expect(element.style.transform).toContain('740px'); expect(element.style.width).toBe('225px');
    layer.pinPointerLabel(label.id); layer.update([]); expect(element.hasAttribute('popover')).toBe(false);
    layer.update([label]); layer.pinPointerLabel(label.id); layer.suspend(); expect(element.hasAttribute('popover')).toBe(false);
    expect(element.style.visibility).toBe('hidden'); element.remove();
  });
  it('leaves other renderers and browsers without the optional top layer on their normal label path', () => {
    const element = document.createElement('button');
    const layer = new FlowLabelLayer(vi.fn());
    layer.update([{ id: 'item', label: 'Item', path: '', x: 80, y: 40, width: 150, height: 40, selected: false, match: false }]);
    layer.attach('item', element);
    Object.defineProperty(element, 'showPopover', { value: undefined });
    layer.pinPointerLabel('item'); expect(element.hasAttribute('popover')).toBe(false);
    expect(element.style.transform).toContain('80px');
  });
});
