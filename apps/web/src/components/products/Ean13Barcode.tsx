type Ean13BarcodeProps = {
  value: string;
  label?: string;
};

const leftOdd = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
];

const leftEven = [
  "0100111", "0110011", "0011011", "0100001", "0011101",
  "0111001", "0000101", "0010001", "0001001", "0010111",
];

const right = [
  "1110010", "1100110", "1101100", "1000010", "1011100",
  "1001110", "1010000", "1000100", "1001000", "1110100",
];

const parity = [
  "OOOOOO", "OOEOEE", "OOEEOE", "OOEEEO", "OEOOEE",
  "OEEOOE", "OEEEOO", "OEOEOE", "OEOEEO", "OEEOEO",
];

function validEan13(value: string) {
  if (!/^\d{13}$/.test(value)) return false;
  const digits = value.split("").map(Number);
  const expected = (10 - (digits.slice(0, 12).reduce(
    (sum, digit, index) => sum + digit * (index % 2 === 0 ? 1 : 3),
    0,
  ) % 10)) % 10;
  return expected === digits[12];
}

function encode(value: string) {
  const digits = value.split("").map(Number);
  const leftParity = parity[digits[0]];
  const leftBits = digits.slice(1, 7).map((digit, index) =>
    leftParity[index] === "O" ? leftOdd[digit] : leftEven[digit],
  ).join("");
  const rightBits = digits.slice(7).map((digit) => right[digit]).join("");
  return `101${leftBits}01010${rightBits}101`;
}

export function Ean13Barcode({ value, label = "Barcode" }: Ean13BarcodeProps) {
  const digits = value.replace(/\D/g, "");
  if (!validEan13(digits)) {
    return (
      <div aria-label={`${label} ${digits || value}`}>
        <strong>{digits || value}</strong>
      </div>
    );
  }

  const bits = encode(digits);
  const quietZone = 10;
  const width = bits.length + quietZone * 2;

  return (
    <figure aria-label={`${label} ${digits}`}>
      <svg
        aria-hidden="true"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        shapeRendering="crispEdges"
        viewBox={`0 0 ${width} 68`}
      >
        <rect fill="#fff" height="68" width={width} x="0" y="0" />
        {bits.split("").map((bit, index) => bit === "1" ? (
          <rect
            fill="#111"
            height={index < 3 || (index >= 45 && index < 50) || index >= 92 ? 52 : 47}
            key={index}
            width="1"
            x={quietZone + index}
            y="2"
          />
        ) : null)}
        <text
          fill="#111"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
          fontSize="9"
          letterSpacing="1.25"
          textAnchor="middle"
          x={width / 2}
          y="65"
        >
          {digits}
        </text>
      </svg>
    </figure>
  );
}
