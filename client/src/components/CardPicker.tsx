import { useEffect, useRef, useState } from 'react';
import { MAX_HINT_LENGTH, MAX_LABEL_LENGTH, type PlayerView } from '../../../shared/protocol.ts';
import { DECKS, randomDeckCard } from '../../../shared/decks.ts';
import { imageFromClipboard, imageToDataUrl } from '../image.ts';
import type { Card } from '../../../shared/protocol.ts';
import { CardFace } from './CardFace.tsx';
import { CheckIcon, DiceIcon, ImageIcon } from './Icons.tsx';

interface Props {
  target: PlayerView;
  current: Card | null; // what you already submitted, if anything
  onSubmit(label: string, image: string | null, hint: string): void;
  onError(message: string): void;
}

export function CardPicker({ target, current, onSubmit, onError }: Props) {
  const [label, setLabel] = useState(current?.label ?? '');
  const [image, setImage] = useState<string | null>(current?.image ?? null);
  const [hint, setHint] = useState(current?.hint ?? '');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [deck, setDeck] = useState('Any');
  const fileRef = useRef<HTMLInputElement>(null);

  const takeBlob = async (blob: Blob | null) => {
    if (!blob) return;
    setBusy(true);
    try {
      setImage(await imageToDataUrl(blob));
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Paste anywhere on the page while picking.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const hasImage = [...e.clipboardData.items].some((i) => i.type.startsWith('image/'));
      const el = e.target as HTMLElement;
      // Let normal text paste into the text fields through.
      if (!hasImage && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      imageFromClipboard(e.clipboardData).then(takeBlob, (err) => onError(err.message));
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const trimmed = label.trim();
  const dirty = !current || current.label !== trimmed || current.image !== image || current.hint !== hint.trim();
  const preview = trimmed || image ? { label: trimmed || '…', image } : null;

  return (
    <div className="picker">
      <div className="picker__target" style={{ '--player-color': target.color } as React.CSSProperties}>
        <span className="swatch" />
        <h2>A card for {target.name}</h2>
      </div>
      <p className="muted small">Everyone will see it except {target.name}.</p>

      <button
        type="button"
        className={`dropzone ${dragging ? 'dropzone--over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void takeBlob(e.dataTransfer.files[0] ?? null);
        }}
        onClick={() => fileRef.current?.click()}
        aria-label="Add a picture: paste, drop or choose a file"
      >
        {busy ? (
          <span className="muted">Shrinking the picture…</span>
        ) : preview ? (
          <div className="picker__preview">
            <CardFace card={preview} />
          </div>
        ) : (
          <span className="dropzone__empty">
            <ImageIcon size={28} />
            <strong>Paste a picture</strong>
            <span>
              <kbd>Ctrl</kbd> + <kbd>V</kbd>, drop a file here, or click to choose one
            </span>
          </span>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void takeBlob(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
      <p className="picker__tip">From Google Images: right-click the picture, choose "Copy image", then paste here.</p>

      <label className="field">
        <span className="field__label">The answer</span>
        <input value={label} maxLength={MAX_LABEL_LENGTH} placeholder="Shrek" onChange={(e) => setLabel(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">
          Hint <em>optional, {target.name} sees this</em>
        </span>
        <input value={hint} maxLength={MAX_HINT_LENGTH} placeholder="Cartoon character" onChange={(e) => setHint(e.target.value)} />
      </label>

      <div className="picker__row">
        <select value={deck} onChange={(e) => setDeck(e.target.value)} aria-label="Deck to draw from">
          <option value="Any">Any deck</option>
          {Object.keys(DECKS).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const pick = randomDeckCard(deck === 'Any' ? undefined : deck);
            setLabel(pick.label);
            setHint(pick.hint);
            setImage(null);
          }}
        >
          <DiceIcon size={18} /> Draw one
        </button>
        {image && (
          <button type="button" className="link-btn" onClick={() => setImage(null)}>
            Remove picture
          </button>
        )}
      </div>

      <button className="btn btn--primary btn--block" disabled={!trimmed || busy || !dirty} onClick={() => onSubmit(label, image, hint)}>
        {current && !dirty ? (
          <>
            <CheckIcon size={18} /> Locked in
          </>
        ) : current ? (
          'Update the card'
        ) : (
          'Lock it in'
        )}
      </button>
    </div>
  );
}
