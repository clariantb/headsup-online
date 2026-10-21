import type { Card } from '../../../shared/protocol.ts';

export function CardFace({ card }: { card: Pick<Card, 'label' | 'image'> }) {
  if (card.image) {
    return (
      <div className="card card--image">
        <img src={card.image} alt={card.label} draggable={false} />
        <div className="card__caption">{card.label}</div>
      </div>
    );
  }
  return (
    <div className="card card--text">
      <span>{card.label}</span>
    </div>
  );
}

/** The back of a card: what you see on your own forehead. */
export function CardBack({ hint }: { hint?: string | null }) {
  return (
    <div className="card card--back">
      <span className="card__q">?</span>
      {hint && <span className="card__hint">{hint}</span>}
    </div>
  );
}
