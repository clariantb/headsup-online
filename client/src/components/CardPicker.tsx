import { useEffect, useRef, useState } from 'react';
import { MAX_HINT_LENGTH, MAX_LABEL_LENGTH } from '../../../shared/protocol.ts';
import { DECKS, randomDeckCard } from '../../../shared/decks.ts';
import { imageFromClipboard, imageToDataUrl } from '../image.ts';
import type { Card } from '../../../shared/protocol.ts';
import { CardFace } from './CardFace.tsx';

interface Props {
  forName: string;
  current: Card | null; // what you already submitted, if anything
  onSubmit(label: string, image: string | null, hint: string): void;
  onError(message: string): void;
}

export function CardPicker({ forName, current, onSubmit, onError }: Props) {
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
      const target = e.target as HTMLElement;
      // Let normal text paste into the name field through.
      if (!hasImage && target.tagName === 'INPUT') return;
      e.preventDefault();
      imageFromClipboard(e.clipboardData).then(takeBlob, (err) => onError(err.message));
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const dirty = !current || current.label !== label.trim() || current.image !== image || current.hint !== hint.trim();
  const preview: Card | null = label.trim() || image ? { label: label.trim() || '…', image, hint, pickedBy: '' } : null;

  return (
    <div className="picker">
      <h2>
        Pick a card for <em>{forName}</em>
      </h2>
      <p className="muted">They'll wear it on their forehead. Everyone except them will see it.</p>

      <div
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
      >
        {busy ? (
          <span>Shrinking image…</span>
        ) : preview ? (
          <div className="picker__preview">
            <CardFace card={preview} />
          </div>
        ) : (
          <span>
            <strong>Paste an image</strong> (Ctrl/⌘+V)
            <br />
            or drop / click to upload
          </span>
        )}
      </div>
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
      <p className="hint">Tip: on Google Images, right-click → "Copy image", then paste here.</p>

      <label className="field">
        <span>Answer (what they need to guess)</span>
        <input
          value={label}
          maxLength={MAX_LABEL_LENGTH}
          placeholder="e.g. Shrek"
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>

      <label className="field">
        <span>Category hint (optional — {forName} will see this)</span>
        <input value={hint} maxLength={MAX_HINT_LENGTH} placeholder="e.g. Cartoon character" onChange={(e) => setHint(e.target.value)} />
      </label>

      <div className="row">
        <select value={deck} onChange={(e) => setDeck(e.target.value)} aria-label="Deck">
          <option>Any</option>
          {Object.keys(DECKS).map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <button
          className="btn btn--ghost"
          onClick={() => {
            const pick = randomDeckCard(deck === 'Any' ? undefined : deck);
            setLabel(pick.label);
            setHint(pick.hint);
            setImage(null);
          }}
        >
          🎲 Random
        </button>
        {image && (
          <button className="btn btn--ghost" onClick={() => setImage(null)}>
            Remove image
          </button>
        )}
      </div>

      <button className="btn btn--primary btn--wide" disabled={!label.trim() || busy || !dirty} onClick={() => onSubmit(label, image, hint)}>
        {current ? (dirty ? 'Update card' : 'Card locked in ✓') : 'Lock it in'}
      </button>
    </div>
  );
}
