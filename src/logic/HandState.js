// Interaction state only; card zones/ownership live in Deck. Positions belong to the view.
export class HandState {
  constructor(instanceIds) {
    this.cards = new Map(instanceIds.map(id => [id, { state: 'inHand', pointer: null }]));
    this.played = [];
  }

  start(instanceId, pointer) {
    const card = this.cards.get(instanceId);
    if (!card || card.state !== 'inHand') return false;
    card.state = 'dragging';
    card.pointer = pointer;
    return true;
  }

  isDragging(instanceId, pointer) {
    const card = this.cards.get(instanceId);
    return card?.state === 'dragging' && card.pointer === pointer;
  }

  play(instanceId, pointer, position) {
    if (!this.isDragging(instanceId, pointer) || this.played.some(card => card.instanceId === instanceId)) return false;
    this.cards.set(instanceId, { state: 'played', pointer: null });
    this.played.push({ ...position, instanceId });
    return true;
  }

  returnCard(instanceId, pointer) {
    if (!this.isDragging(instanceId, pointer)) return false;
    this.cards.set(instanceId, { state: 'returning', pointer: null });
    return true;
  }

  finishReturn(instanceId) {
    if (this.cards.get(instanceId)?.state !== 'returning') return false;
    this.cards.set(instanceId, { state: 'inHand', pointer: null });
    return true;
  }

  cancelTransient() {
    this.cards.forEach((card, instanceId) => {
      if (card.state === 'dragging' || card.state === 'returning') {
        this.cards.set(instanceId, { state: 'inHand', pointer: null });
      }
    });
  }
}
