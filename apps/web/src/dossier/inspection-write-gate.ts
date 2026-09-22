export interface InspectionWriteGate {
  readonly pending: boolean;
  readonly tryStart: () => boolean;
  readonly finish: () => void;
}
