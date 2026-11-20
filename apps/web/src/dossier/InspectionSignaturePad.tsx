import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

interface InspectionSignaturePadProps {
  readonly disabled: boolean;
  readonly inspectionCode: string;
  readonly resetRevision: number;
  readonly onSignatureFile: (file: File) => Promise<void>;
}

const SIGNATURE_CANVAS_WIDTH = 900;
const SIGNATURE_CANVAS_HEIGHT = 300;

function signaturePoint(
  canvas: HTMLCanvasElement,
  event: ReactPointerEvent<HTMLCanvasElement>,
): { readonly x: number; readonly y: number } {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function paintBlankCanvas(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.save();
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

function signatureFileName(inspectionCode: string): string {
  const safeCode =
    inspectionCode
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'inspection';
  return `${safeCode}-signature.png`;
}

export function InspectionSignaturePad({
  disabled,
  inspectionCode,
  resetRevision,
  onSignatureFile,
}: InspectionSignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const cachedFileRef = useRef<File | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const instructionsId = useId();
  const errorId = useId();

  function clearCanvas(): void {
    const canvas = canvasRef.current;
    if (!canvas) return;
    paintBlankCanvas(canvas);
    activePointerIdRef.current = null;
    cachedFileRef.current = null;
    setHasInk(false);
    setError(null);
  }

  useEffect(() => {
    clearCanvas();
  }, [resetRevision]);

  function startStroke(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (disabled || exporting) return;
    const canvas = event.currentTarget;
    const context = canvas.getContext('2d');
    if (!context) {
      setError('Die Zeichenfläche für die Unterschrift ist nicht verfügbar.');
      return;
    }

    event.preventDefault();
    activePointerIdRef.current = event.pointerId;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic browser tests and some embedded browsers may not expose capture.
    }

    const point = signaturePoint(canvas, event);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x + 0.01, point.y + 0.01);
    context.lineWidth = 5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#1f211d';
    context.stroke();

    cachedFileRef.current = null;
    setHasInk(true);
    setError(null);
  }

  function continueStroke(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (
      disabled ||
      exporting ||
      activePointerIdRef.current !== event.pointerId
    ) {
      return;
    }
    const canvas = event.currentTarget;
    const context = canvas.getContext('2d');
    if (!context) return;

    event.preventDefault();
    const point = signaturePoint(canvas, event);
    context.lineTo(point.x, point.y);
    context.stroke();

    cachedFileRef.current = null;
    setHasInk(true);
  }

  function endStroke(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (activePointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    activePointerIdRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may not exist for synthetic/embedded pointer streams.
    }
  }

  async function exportSignature(): Promise<void> {
    if (disabled || exporting || !hasInk) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    setExporting(true);
    setError(null);
    try {
      let file = cachedFileRef.current;
      if (!file) {
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, 'image/png');
        });
        if (!blob || blob.size === 0) {
          throw new Error('Die Unterschrift konnte nicht als PNG exportiert werden.');
        }
        file = new File([blob], signatureFileName(inspectionCode), {
          type: 'image/png',
        });
        cachedFileRef.current = file;
      }
      await onSignatureFile(file);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Die gezeichnete Unterschrift konnte nicht vorbereitet werden.',
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div
      className="inspection-signature-pad"
      data-inspection-signature-pad
      lang="de-CH"
    >
      <div className="tenancy-form-heading">
        <strong>Unterschrift zeichnen</strong>
        <span>Mit Finger, Stift oder Maus · PNG</span>
      </div>
      <canvas
        aria-describedby={error ? `${instructionsId} ${errorId}` : instructionsId}
        aria-label="Zeichenfläche für die Unterschrift"
        className="inspection-signature-canvas"
        height={SIGNATURE_CANVAS_HEIGHT}
        onPointerCancel={endStroke}
        onPointerDown={startStroke}
        onPointerMove={continueStroke}
        onPointerUp={endStroke}
        ref={canvasRef}
        width={SIGNATURE_CANVAS_WIDTH}
      />
      <div className="inspection-signature-actions">
        <button
          className="button-secondary"
          disabled={disabled || exporting || !hasInk}
          onClick={clearCanvas}
          type="button"
        >
          Zeichnung löschen
        </button>
        <button
          className="button-primary"
          disabled={disabled || exporting || !hasInk}
          onClick={() => void exportSignature()}
          type="button"
        >
          {exporting ? 'Wird hinzugefügt…' : 'Gezeichnete Unterschrift hinzufügen'}
        </button>
      </div>
      {error ? (
        <p className="setup-form-error" id={errorId} role="alert">{error}</p>
      ) : null}
      <p className="setup-hint" id={instructionsId}>
        Die Zeichnung bleibt lokal, bis Sie die Unterschrift hinzufügen.
        Danach wird die Datei für diese Inspektion gespeichert und die
        Zuordnung zur ausgewählten Person separat bestätigt.
        Alternativ können Sie eine vorhandene PNG- oder JPEG-Datei verwenden.
      </p>
    </div>
  );
}
