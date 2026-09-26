import {
  ApplicationError,
  type LuzernerLeasePdfParty,
  type LuzernerLeasePdfPort,
  type LuzernerLeasePdfRenderInput,
  type PdfRenderResult,
} from '@portfolio/application';

type LuzernerLeaseFormContent = LuzernerLeasePdfRenderInput['form'];
type LuzernerAncillaryCostKey =
  keyof LuzernerLeaseFormContent['ancillaryCosts'];

const LUZERNER_ANCILLARY_COST_KEYS: readonly LuzernerAncillaryCostKey[] = [
  'heating_hot_water',
  'cold_water',
  'caretaker_stair_cleaning',
  'garden_surroundings_snow',
  'lift',
  'common_electricity_gas',
  'ara_kva_sewer',
  'tv_cable',
  'laundry',
  'administration_share',
];

const PAGE_COUNT = 8;
const PAGE_HEIGHT = 841.89;
const OVERLAY_BLOCK_BYTES = 32768;
const FONT = '/FPortfolio';

interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

type Commands = string[];

function box(x0: number, y0: number, x1: number, y1: number): Rect {
  return { x0, y0, x1, y1 };
}

const tenantSlots = [
  {
    name: box(133.741, 508.092, 257.228, 531.327),
    address: box(133.741, 479.654, 256.993, 503.604),
    postal: box(133.741, 451.583, 257.048, 475.882),
  },
  {
    name: box(273.85, 507.853, 397.252, 531.327),
    address: box(273.85, 479.418, 397.252, 503.23),
    postal: box(273.85, 451.475, 397.252, 475.133),
  },
  {
    name: box(413.585, 508.329, 536.987, 532.151),
    address: box(413.585, 480.256, 536.987, 503.71),
    postal: box(413.585, 451.696, 536.987, 475.641),
  },
] as const;

const CP1252_SPECIAL = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

function pdfNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function winAnsiHex(value: string): string {
  let result = '';
  for (const char of value.normalize('NFC')) {
    const point = char.codePointAt(0)!;
    const byte =
      point <= 0x7f || (point >= 0xa0 && point <= 0xff)
        ? point
        : CP1252_SPECIAL.get(point);
    if (byte === undefined) {
      throw new ApplicationError(
        'LUZERNER_PDF_UNSUPPORTED_CHARACTER',
        "The Luzerner PDF cannot render character '" +
          char +
          "' (U+" +
          point.toString(16).toUpperCase() +
          ').',
      );
    }
    result += byte.toString(16).padStart(2, '0').toUpperCase();
  }
  return result;
}

function estimatedWidth(value: string, size: number): number {
  let units = 0;
  for (const char of value) {
    if (" ilI.,:;!|'".includes(char)) units += 0.28;
    else if ('mwMW@%'.includes(char)) units += 0.86;
    else units += 0.54;
  }
  return units * size;
}

function fitSize(value: string, width: number, preferred: number): number {
  let size = preferred;
  while (size > 5.5 && estimatedWidth(value, size) > width) size -= 0.25;
  return size;
}

function addText(
  commands: Commands,
  value: string | null | undefined,
  target: Rect,
  preferred = 9,
): void {
  const normalized = value?.trim();
  if (!normalized) return;
  const size = fitSize(normalized, target.x1 - target.x0 - 2, preferred);
  const y =
    target.y0 +
    Math.max(1.5, ((target.y1 - target.y0) - size) * 0.46);
  commands.push(
    'BT ' +
      FONT +
      ' ' +
      pdfNumber(size) +
      ' Tf ' +
      pdfNumber(target.x0 + 1) +
      ' ' +
      pdfNumber(y) +
      ' Td <' +
      winAnsiHex(normalized) +
      '> Tj ET',
  );
}

function addTextAt(
  commands: Commands,
  value: string | null | undefined,
  x: number,
  y: number,
  size = 9,
): void {
  const normalized = value?.trim();
  if (!normalized) return;
  commands.push(
    'BT ' +
      FONT +
      ' ' +
      pdfNumber(size) +
      ' Tf ' +
      pdfNumber(x) +
      ' ' +
      pdfNumber(y) +
      ' Td <' +
      winAnsiHex(normalized) +
      '> Tj ET',
  );
}

function addCheck(commands: Commands, target: Rect): void {
  const inset = 1.6;
  const x0 = target.x0 + inset;
  const x1 = target.x1 - inset;
  const y0 = target.y0 + inset;
  const y1 = target.y1 - inset;
  commands.push(
    'q 0 0 0 RG 0.8 w ' +
      pdfNumber(x0) +
      ' ' +
      pdfNumber(y0) +
      ' m ' +
      pdfNumber(x1) +
      ' ' +
      pdfNumber(y1) +
      ' l S ' +
      pdfNumber(x0) +
      ' ' +
      pdfNumber(y1) +
      ' m ' +
      pdfNumber(x1) +
      ' ' +
      pdfNumber(y0) +
      ' l S Q',
  );
}

function addLine(
  commands: Commands,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  commands.push(
    'q 0 0 0 RG 0.65 w ' +
      pdfNumber(x0) +
      ' ' +
      pdfNumber(y0) +
      ' m ' +
      pdfNumber(x1) +
      ' ' +
      pdfNumber(y1) +
      ' l S Q',
  );
}

function addMultiline(
  commands: Commands,
  value: string | null | undefined,
  target: Rect,
  size: number,
  leading: number,
): void {
  if (!value?.trim()) return;
  const words = value.trim().split(/\s+/u);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? line + ' ' + word : word;
    if (estimatedWidth(candidate, size) <= target.x1 - target.x0 - 4) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  const maxLines = Math.max(
    1,
    Math.floor((target.y1 - target.y0 - 4) / leading),
  );
  if (lines.length > maxLines) {
    throw new ApplicationError(
      'LUZERNER_PDF_TEXT_OVERFLOW',
      'Text does not fit in the physical Luzerner 2020 form area.',
    );
  }
  const top = target.y1 - size - 2;
  lines.forEach((entry, index) =>
    addTextAt(commands, entry, target.x0 + 2, top - index * leading, size),
  );
}

function swissDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  return match ? match[3] + '.' + match[2] + '.' + match[1] : value;
}

function swissMoney(value: string | null): string | null {
  if (value === null) return null;
  const parts = value.split('.');
  const grouped = parts[0]!.replace(/\B(?=(\d{3})+(?!\d))/gu, "'");
  return grouped + '.' + (parts[1] ?? '00').padEnd(2, '0').slice(0, 2);
}

function moneyCents(value: string | null): bigint {
  return BigInt((value ?? '0.00').replace('.', ''));
}

function totalMoney(form: LuzernerLeaseFormContent): string {
  const cents =
    moneyCents(form.netRent) +
    moneyCents(form.garageParkingRent) +
    moneyCents(form.ancillaryAdvance) +
    moneyCents(form.ancillaryFlat);
  const major = cents / 100n;
  const minor = (cents % 100n).toString().padStart(2, '0');
  return swissMoney(major.toString() + '.' + minor)!;
}

function postalCity(party: LuzernerLeasePdfParty): string | null {
  const value = [party.postalCode?.trim(), party.city?.trim()]
    .filter(Boolean)
    .join(' ');
  return value || null;
}

function landlordLine(parties: readonly LuzernerLeasePdfParty[]): string {
  return parties
    .map((party) => {
      const location = [party.addressLine, postalCity(party)]
        .filter(Boolean)
        .join(', ');
      return [party.displayName, location].filter(Boolean).join(', ');
    })
    .join(' / ');
}

function unitLabel(input: LuzernerLeasePdfRenderInput): string {
  const kind = {
    apartment: 'Wohnung',
    house: 'Haus',
    studio: 'Studio',
    office: 'Büro',
    commercial: 'Gewerberaum',
    other: 'Mietobjekt',
  }[input.unit.unitType];
  const rooms =
    input.unit.rooms === null ? '' : input.unit.rooms.toString() + '-Zimmer-';
  return (rooms + kind + ' ' + input.unit.unitNumber).trim();
}

function placeDate(form: LuzernerLeaseFormContent): string | null {
  const parts = [form.placeOfSigning, swissDate(form.signingDate)].filter(
    Boolean,
  );
  return parts.length === 0 ? null : parts.join(', ');
}

function pageOne(input: LuzernerLeasePdfRenderInput): Commands {
  if (input.landlords.length === 0) {
    throw new ApplicationError(
      'LUZERNER_PDF_LANDLORD_REQUIRED',
      'The Luzerner PDF requires a landlord party.',
    );
  }
  if (input.tenants.length === 0 || input.tenants.length > 3) {
    throw new ApplicationError(
      'LUZERNER_PDF_TENANT_CAPACITY',
      'The Luzerner 2020 form supports one to three tenant/co-tenant parties.',
    );
  }

  const form = input.form;
  const c: Commands = [];
  addText(c, landlordLine(input.landlords), box(133.741, 574.65, 536.987, 598.01));
  addText(
    c,
    input.landlordRepresentatives.length === 0
      ? null
      : landlordLine(input.landlordRepresentatives),
    box(133.741, 545.082, 536.987, 569.164),
  );

  input.tenants.forEach((tenant, index) => {
    const slot = tenantSlots[index]!;
    addText(c, tenant.displayName, slot.name);
    addText(c, tenant.addressLine, slot.address, 8.5);
    addText(c, postalCity(tenant), slot.postal, 8.5);
  });

  addText(c, unitLabel(input), box(133.366, 370.456, 460.189, 393.908));
  addText(
    c,
    (input.property.street + ' ' + input.property.houseNumber).trim(),
    box(133.741, 342.516, 382.642, 366.081),
  );
  addText(
    c,
    (input.property.postalCode + ' ' + input.property.city).trim(),
    box(133.706, 313.472, 536.578, 336.904),
  );
  addTextAt(c, form.ewid, 497.8, 377, 7.2);
  addTextAt(c, form.egid, 415.5, 348, 7.2);
  addText(
    c,
    form.intendedForPersonCount === null
      ? null
      : String(form.intendedForPersonCount),
    box(157.336, 294.413, 203.836, 309.745),
  );
  if (form.intendedForPersonCount !== null) {
    addCheck(c, box(130.784, 298.522, 141.368, 309.371));
  }

  const checks: Array<[boolean, Rect]> = [
    [form.familyApartment, box(253.56, 300.12, 261.48, 308.64)],
    [form.registeredPartnership, box(350.64, 300, 358.68, 308.52)],
    [form.furnished, box(491.891, 298.413, 502.405, 309.417)],
    [form.separateRoom, box(131.741, 277.058, 142.512, 287.83)],
    [form.cellar, box(205.036, 276.799, 215.673, 287.763)],
    [form.attic, box(251.755, 276.649, 262.391, 287.36)],
    [form.separateApartment, box(431.768, 276.745, 442.336, 287.845)],
    [form.garage, box(132.239, 259.61, 142.793, 270.615)],
    [form.parkingSpace, box(303.954, 259.536, 314.536, 270.608)],
  ];
  checks.forEach(([selected, target]) => {
    if (selected) addCheck(c, target);
  });
  addText(c, form.garageNumber, box(254.618, 255.835, 287.946, 274.017), 8);
  addText(
    c,
    form.parkingSpaceNumber,
    box(385.609, 254.997, 425.864, 273.09),
    8,
  );
  if (form.additionalObjectLabel) {
    addCheck(c, box(432.153, 259.488, 442.861, 270.533));
    addText(
      c,
      form.additionalObjectLabel,
      box(446.7, 258.208, 536.672, 273.09),
      8,
    );
  }

  const sharedBoxes = {
    laundry_room: box(47.9455, 228.99, 58.5, 240.158),
    drying_room: box(131.993, 229.092, 142.568, 240.138),
    drying_area: box(204.975, 229.051, 215.611, 240.097),
    stroller_room: box(305.325, 229.092, 316.043, 240.179),
    garden: box(47.9864, 211.767, 58.7045, 222.895),
    hobby_room: box(132.464, 211.829, 143.059, 222.854),
    playground: box(204.975, 211.829, 215.55, 222.874),
    bicycle_moped_room: box(305.154, 211.832, 315.804, 222.908),
  } as const;
  for (const key of Object.keys(sharedBoxes) as Array<
    keyof typeof sharedBoxes
  >) {
    if (form.sharedUse[key]) addCheck(c, sharedBoxes[key]);
  }

  const customSharedUseSlots = [
    {
      check: box(432.354, 228.908, 442.936, 240.117),
      text: box(446.754, 227.172, 536.7, 241.876),
    },
    {
      check: box(432.354, 211.808, 443.018, 222.908),
      text: box(446.79, 210.918, 536.674, 225.963),
    },
  ] as const;
  form.customSharedUse.slice(0, 2).forEach((value, index) => {
    const slot = customSharedUseSlots[index]!;
    addCheck(c, slot.check);
    addText(c, value, slot.text, 8);
  });

  if (form.useType === 'apartment') {
    addCheck(c, box(131.911, 197.04, 142.527, 208.045));
  } else if (form.useType === 'commercial') {
    addCheck(c, box(204.518, 197.054, 215.1, 208.045));
  } else if (form.useType === 'other') {
    addText(c, form.useTypeOther, box(366.245, 194.53, 536.7, 209.136), 8.5);
  }

  addText(
    c,
    swissDate(input.agreementEffectiveFrom),
    box(106.507, 152.417, 294.034, 181.945),
  );
  addText(c, swissDate(form.moveInDate), box(414.982, 152.09, 547.091, 182.109));

  if (form.durationKind === 'indefinite') {
    addCheck(c, box(131.585, 130.855, 139.625, 139.375));
  } else if (form.durationKind === 'minimum_term') {
    addCheck(c, box(220.2, 130.8, 228.12, 139.32));
    addText(
      c,
      swissDate(form.minimumCancelableOn),
      box(310.145, 110.854, 367.473, 127.672),
      8,
    );
  } else if (form.durationKind === 'fixed_term') {
    addCheck(c, box(376.56, 129.84, 384.48, 138.36));
    addText(
      c,
      swissDate(form.fixedEndDate),
      box(480.131, 110.69, 537.13, 127.617),
      8,
    );
  }

  if (form.terminationSchedule === 'monthly_except_december') {
    addCheck(c, box(150.12, 93.6, 158.16, 102));
  } else if (form.terminationSchedule === 'quarter_ends') {
    addCheck(c, box(383.678, 92.722, 391.718, 101.242));
  } else if (form.terminationSchedule === 'custom') {
    addTextAt(c, form.terminationScheduleCustom, 403, 94, 7.5);
  }

  const noticeChecks = {
    residential_3_months: box(149.719, 71.215, 157.759, 79.735),
    commercial_6_months: box(274.44, 71.16, 281.4, 79.68),
    furnished_room_14_days: box(413.88, 70.2, 420.12, 78.72),
    longer_months: box(150, 57.36, 157.92, 65.88),
  } as const;
  if (form.noticePeriodKind !== 'unset') {
    addCheck(c, noticeChecks[form.noticePeriodKind]);
  }
  if (form.noticePeriodKind === 'longer_months') {
    addText(
      c,
      form.longerNoticeMonths === null ? null : String(form.longerNoticeMonths),
      box(275.454, 53.527, 318.109, 68.436),
      8,
    );
  }

  return c;
}

function pageTwo(input: LuzernerLeasePdfRenderInput): Commands {
  const form = input.form;
  const c: Commands = [];

  addText(c, swissMoney(form.netRent), box(487.276, 768.154, 548.476, 777.915), 8.5);
  addText(
    c,
    swissMoney(form.garageParkingRent),
    box(486.791, 752.772, 548.482, 762.54),
    8.5,
  );
  addText(
    c,
    swissMoney(form.ancillaryAdvance),
    box(486.983, 737.427, 548.713, 747.155),
    8.5,
  );
  addText(
    c,
    swissMoney(form.ancillaryFlat),
    box(486.154, 722.864, 547.905, 732.642),
    8.5,
  );
  addText(c, totalMoney(form), box(487.017, 523.763, 548.714, 538.672));

  const payment = {
    monthly: box(162.145, 513.944, 169.945, 523.304),
    quarterly: box(235.32, 514.08, 244.08, 523.44),
    semiannual: box(322.44, 514.08, 331.2, 523.44),
  } as const;
  if (form.paymentFrequency !== 'unset') addCheck(c, payment[form.paymentFrequency]);

  if (form.rentAdjustmentMode === 'termination_date') {
    addCheck(c, box(47.826, 480.398, 56.585, 489.758));
    addText(
      c,
      form.rentAdjustmentAdvanceMonths === null
        ? null
        : String(form.rentAdjustmentAdvanceMonths),
      box(255.109, 479.24, 304.855, 492.731),
      8.5,
    );
  } else if (form.rentAdjustmentMode === 'indexation') {
    addCheck(c, box(48, 457.08, 56.88, 466.44));
    addTextAt(c, form.consumerPriceIndexPoints, 365, 459.3, 8);
  } else if (form.rentAdjustmentMode === 'graduated') {
    addCheck(c, box(47.52, 434.28, 56.28, 443.64));
  }

  if (form.ancillaryClosingDate === 'june_30') {
    addCheck(c, box(246.24, 393.96, 255, 403.32));
  } else if (form.ancillaryClosingDate === 'december_31') {
    addCheck(c, box(299.88, 393.72, 308.76, 403.08));
  } else if (form.ancillaryClosingDate === 'custom') {
    addCheck(c, box(374.88, 393.6, 383.64, 402.96));
    addText(
      c,
      form.ancillaryClosingDateCustom,
      box(391.848, 391.04, 547.411, 404.684),
      8,
    );
  }

  addText(
    c,
    swissMoney(form.securityAmount),
    box(485.421, 363.13, 546.622, 376.621),
    8.5,
  );
  if (form.tenantNamedDepositAccount) {
    addCheck(c, box(49.001, 348.919, 57.881, 358.279));
    addText(
      c,
      form.depositAccountReference,
      box(313.711, 345.972, 542.941, 359.613),
      8,
    );
  }
  if (form.privateLiabilityPolicy === 'yes') {
    addCheck(c, box(150.48, 331.44, 159.24, 340.8));
  } else if (form.privateLiabilityPolicy === 'no') {
    addCheck(c, box(179.337, 331.328, 188.097, 340.688));
  }

  addText(c, form.mortgageReferenceRate, box(200.864, 305.847, 243.085, 319.072), 7.5);
  addText(c, form.costIncreaseCompensatedThrough, box(395.127, 306.017, 438.085, 319.181), 7.5);
  addText(c, form.consumerPriceIndex, box(201.048, 287.08, 242.693, 300.162), 7.5);
  addText(c, form.consumerPriceIndexMonthYear, box(305.918, 288.338, 348.931, 301.491), 7.5);
  addText(c, form.consumerPriceIndexBasis, box(394.855, 287.414, 437.978, 300.69), 7.5);

  if (
    form.separateRentReserveAgreement ||
    form.rentReserveAmount !== null ||
    form.rentReservePercent !== null
  ) {
    addCheck(c, box(48.355, 260.354, 57.194, 270.564));
    addText(c, swissMoney(form.rentReserveAmount), box(354.764, 259.647, 405.222, 272.834), 7.5);
    addText(c, form.rentReservePercent, box(417.856, 259.32, 468.456, 272.855), 7.5);
  }

  addMultiline(c, form.remarksAttachments, box(118.957, 184.282, 547.214, 241.965), 8, 9.5);
  if (form.initialRentFormAttached) addCheck(c, box(118.933, 170.916, 127.752, 181.055));
  addText(c, placeDate(form), box(44.918, 100.054, 204.695, 113.575), 8.5);

  const standardModes = LUZERNER_ANCILLARY_COST_KEYS.map(
    (key) => form.ancillaryCosts[key],
  );
  const custom = [...form.customAncillaryCosts].slice(0, 2);
  const modes = [...standardModes, ...custom.map((entry) => entry.mode)];
  while (modes.length < 12) modes.push('excluded');

  const topBaselines = [
    150.5, 163.2, 175.8, 189.6, 202.7, 214.6,
    227.1, 239.2, 252.7, 265.9, 278.9, 291.6,
  ];
  custom.forEach((entry, index) => {
    addTextAt(
      c,
      '- ' + entry.label,
      47.9,
      PAGE_HEIGHT - topBaselines[10 + index]!,
      8.5,
    );
  });
  modes.forEach((mode, index) => {
    const baseline = topBaselines[index]!;
    const y = PAGE_HEIGHT - baseline + 3.5;
    if (mode === 'excluded') {
      if (index < 10 || custom[index - 10]?.label) addLine(c, 56.2, y, 525, y);
    } else if (mode === 'flat') {
      addTextAt(c, '*', 542.4, PAGE_HEIGHT - baseline, 8.8);
    }
  });

  return c;
}

function pageEight(input: LuzernerLeasePdfRenderInput): Commands {
  const c: Commands = [];
  addMultiline(
    c,
    input.form.specialProvisions,
    box(304.7, 380, 559.8, 806),
    8.4,
    10.6,
  );
  addText(
    c,
    placeDate(input.form),
    box(355.887, 296.575, 571.386, 315.956),
    8.5,
  );
  return c;
}

function marker(page: number): Uint8Array {
  return new TextEncoder().encode(
    '%%PORTFOLIO_LUZERNER_OVERLAY_PAGE_' + page + '%%',
  );
}

function findUnique(haystack: Uint8Array, needle: Uint8Array): number {
  let found = -1;
  outer: for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    if (found !== -1) return -2;
    found = i;
  }
  return found;
}

function fillBlock(
  target: Uint8Array,
  page: number,
  commands: Commands,
): void {
  const offset = findUnique(target, marker(page));
  if (offset < 0) {
    throw new ApplicationError(
      'LUZERNER_PDF_TEMPLATE_INVALID',
      'Template overlay marker for page ' + page + ' is missing or duplicated.',
    );
  }
  const payload = new TextEncoder().encode(commands.join('\n') + '\n');
  if (payload.byteLength > OVERLAY_BLOCK_BYTES) {
    throw new ApplicationError(
      'LUZERNER_PDF_OVERLAY_TOO_LARGE',
      'Rendered overlay for page ' + page + ' exceeds reserved capacity.',
    );
  }
  target.fill(0x20, offset, offset + OVERLAY_BLOCK_BYTES);
  target.set(payload, offset);
}

function fileSafe(value: string): string {
  return (
    value
      .trim()
      .replace(/[^A-Za-z0-9._-]+/gu, '-')
      .replace(/^-+|-+$/gu, '') || 'agreement'
  );
}

export class CanonicalLuzernerPdfRenderer implements LuzernerLeasePdfPort {
  private readonly template: Uint8Array;

  constructor(template: Uint8Array) {
    if (template.byteLength === 0) {
      throw new ApplicationError(
        'LUZERNER_PDF_TEMPLATE_INVALID',
        'Luzerner PDF template is empty.',
      );
    }
    this.template = new Uint8Array(template);
    for (let page = 1; page <= PAGE_COUNT; page += 1) {
      if (findUnique(this.template, marker(page)) < 0) {
        throw new ApplicationError(
          'LUZERNER_PDF_TEMPLATE_INVALID',
          'Luzerner PDF template must contain one overlay marker for page ' +
            page +
            '.',
        );
      }
    }
  }

  async renderLuzernerLeaseAgreement(
    input: LuzernerLeasePdfRenderInput,
  ): Promise<PdfRenderResult> {
    const content = new Uint8Array(this.template);
    const pages: readonly Commands[] = [
      pageOne(input),
      pageTwo(input),
      [],
      [],
      [],
      [],
      [],
      pageEight(input),
    ];
    pages.forEach((commands, index) => fillBlock(content, index + 1, commands));

    return {
      fileName: 'mietvertrag-' + fileSafe(input.agreementCode) + '.pdf',
      content,
    };
  }
}
