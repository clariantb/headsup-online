import type { Card } from '../../../shared/protocol.ts';

export function CardFace({ card }: { card: Card }) {
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
