export type Luzerner2020Rgb = readonly [number, number, number];

export interface Luzerner2020FixedTextLine {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly bold: boolean;
  readonly color: Luzerner2020Rgb;
}
