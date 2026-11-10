import Phaser from 'phaser';
import { THEME } from '../theme/ultimaMaoTheme.js';
import { rect, label } from './draw.js';
import { cardPresentation } from './cardPresentation.js';

// This boundary can later draw textures instead of programmatic frames/text.
export function createCardView(scene, x, y, w, instance, {
  hidden = false, draggable = false, selected = false, renderEnchantment,
} = {}) {
  const h = w * 7 / 5;
  const group = scene.add.container(x, selected ? y - Math.min(10, w * .15) : y);
  const objects = [];
  const addRect = (...args) => objects.push(rect(scene, ...args));
  const addLabel = (...args) => objects.push(label(scene, ...args));
  const presentation = cardPresentation(instance, { hidden });
  addRect(-w/2,-h/2,w,h,hidden ? THEME.graphite : THEME.cardFace,
    selected ? THEME.ivory : THEME.graphite,Math.max(4,w*.065));
  addRect(-w/2+4,-h/2+4,w-8,h-8,hidden ? THEME.deep : THEME.cardFace,
    hidden ? THEME.blood : THEME.ink,Math.max(2,w*.03));
  if (hidden) {
    addRect(-w*.34,-h*.35,w*.68,h*.7,THEME.deep,THEME.blood,2);
    addLabel(0,0,'✥',Math.max(13,w*.33),THEME.blood,{serif:true});
  } else {
    const color = presentation.red ? THEME.blood : THEME.ink;
    addLabel(-w*.30,-h*.34,presentation.rank,Math.max(13,w*.23),color,{serif:true,bold:true});
    addLabel(0,0,presentation.symbol,Math.max(20,w*.52),color,{serif:true});
    addLabel(w*.30,h*.34,presentation.rank,Math.max(13,w*.23),color,{serif:true,bold:true});
    group.setData('instanceId', instance.instanceId);
  }
  group.add(objects);
  group.setSize(w,h);
  // Reserved extension point, with no default icon or effect. Never called for hidden cards.
  if (!hidden && instance.enchantment && renderEnchantment) {
    renderEnchantment(scene, group, instance.enchantment, { width: w, height: h });
  }
  if (draggable && !hidden) {
    // InputManager adds the container's displayOrigin before hit testing.
    group.setInteractive(new Phaser.Geom.Rectangle(0,0,w,h),Phaser.Geom.Rectangle.Contains);
    scene.input.setDraggable(group);
  }
  return group;
}

export function card(scene, x, y, w, instance, selected = false, hidden = false) {
  return createCardView(scene, x, y, w, instance, { selected, hidden });
}

export function draggableCard(scene, x, y, w, instance) {
  return createCardView(scene, x, y, w, instance, { draggable: true });
}
